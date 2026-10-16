import path from 'node:path';

// Build-time instrumentation only: the offline source lessons are never rewritten.
export function instrumentHtml(source, relativePath = 'index.html') {
  if (typeof source !== 'string') throw new TypeError('HTML must be a string.');
  if (source.includes('id="english-access-guard"')) return source;
  const normalized = relativePath.replace(/\\/g, '/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').some((part) => part === '..')) {
    throw new Error('The instrumented path must stay within the site.');
  }
  const directory = path.posix.dirname(normalized);
  const assets = `${path.posix.relative(directory, 'assets') || '.'}/`;
  const injection = `
  <!-- Student access is checked before this published lesson is displayed. -->
  <style id="english-access-guard">html.access-pending body{visibility:hidden!important}</style>
  <script src="${assets}access-config.js" defer></script>
  <script src="${assets}auth-client.js" defer></script>
  <script src="${assets}activity-tracker.js" defer></script>
  <link rel="stylesheet" href="${assets}access.css">
`;
  if (!/<head\b[^>]*>/i.test(source) || !/<html\b[^>]*>/i.test(source)) {
    throw new Error(`${relativePath}: expected a complete HTML document.`);
  }
  let html = source.replace(/<html\b([^>]*)>/i, (whole, attributes) => {
    const classAttribute = /\bclass\s*=\s*(?:(["'])(.*?)\1|([^\s"'=<>`]+))/i;
    if (classAttribute.test(attributes)) {
      return `<html${attributes.replace(classAttribute, (match, quote, classes, unquoted) => `class=${quote || '"'}${classes ?? unquoted} access-pending${quote || '"'}`)}>`;
    }
    return `<html${attributes} class="access-pending">`;
  });
  return html.replace(/<head\b[^>]*>/i, (head) => head + injection);
}
