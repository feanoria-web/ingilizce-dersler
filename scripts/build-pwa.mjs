import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const digest = value => createHash('sha256').update(value).digest('hex').slice(0, 16);
const marker = /\s*<!-- english-pwa:start -->[\s\S]*?<!-- english-pwa:end -->/g;

function relativeUrl(file, target) {
  return path.relative(path.dirname(file), target).split(path.sep).join('/');
}

async function htmlFiles(directory) {
  const results = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const item = path.join(directory, entry.name);
    if (entry.isDirectory()) results.push(...await htmlFiles(item));
    else if (entry.isFile() && /\.html$/i.test(entry.name)) results.push(item);
  }
  return results;
}

export async function buildPwa(root = SITE_ROOT) {
  const output = path.join(root, '_site');
  const [manifest, offline, worker, registration] = await Promise.all([
    fs.readFile(path.join(root, 'manifest.webmanifest'), 'utf8'),
    fs.readFile(path.join(root, 'offline.html'), 'utf8'),
    fs.readFile(path.join(root, 'service-worker.js'), 'utf8'),
    fs.readFile(path.join(root, 'assets/pwa-register.js'), 'utf8'),
  ]);
  // Fail before changing the output when the normal site build has not run.
  await fs.access(path.join(output, 'index.html'));
  JSON.parse(manifest);
  const offlinePath = path.join(output, 'offline.html');
  const registerPath = path.join(output, 'assets/pwa-register.js');
  await fs.mkdir(path.dirname(registerPath), { recursive: true });
  await Promise.all([
    fs.writeFile(path.join(output, 'manifest.webmanifest'), manifest),
    fs.writeFile(offlinePath, offline),
    fs.writeFile(path.join(output, 'service-worker.js'), worker.replaceAll('__PWA_OFFLINE_REVISION__', digest(offline))),
    fs.writeFile(registerPath, registration),
  ]);
  try {
    await fs.copyFile(path.join(root, 'privacy.html'), path.join(output, 'privacy.html'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  let pages = 0;
  for (const file of await htmlFiles(output)) {
    if (file === offlinePath) continue;
    const html = (await fs.readFile(file, 'utf8')).replace(marker, '');
    if (!/<\/head\s*>/i.test(html)) continue;
    const theme = /<meta\b[^>]*\bname\s*=\s*["']theme-color["']/i.test(html) ? ''
      : '\n<meta name="theme-color" content="#164e45">';
    const injection = `\n<!-- english-pwa:start -->\n<link rel="manifest" href="${relativeUrl(file, path.join(output, 'manifest.webmanifest'))}">${theme}\n<script defer src="${relativeUrl(file, registerPath)}?v=${digest(registration)}"></script>\n<!-- english-pwa:end -->\n`;
    await fs.writeFile(file, html.replace(/\s*<\/head\s*>/i, `${injection}</head>`));
    pages++;
  }
  return { pages, offlineRevision: digest(offline) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildPwa();
  console.log(`Uygulama desteği ${result.pages} sayfaya eklendi; dersler her zaman ağdan alınır.`);
}
