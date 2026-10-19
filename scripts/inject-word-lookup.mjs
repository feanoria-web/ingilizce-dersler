import path from 'node:path';
import vm from 'node:vm';

export function normalizeTerm(value) {
  if (typeof value !== 'string') return '';
  const term = value.replace(/[‘’]/g, "'").replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
  return term.length <= 80 && /^[a-z]+(?:['-][a-z]+)*(?: [a-z]+(?:['-][a-z]+)*){0,4}$/.test(term) ? term : '';
}

export function lessonVocabulary(source) {
  const scripts = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)];
  const data = scripts.find(([, attrs, body]) => !/application\/(?:json|ld\+json)/i.test(attrs) && /\bconst LESSON\s*=/.test(body));
  if (!data) return [];
  try {
    // Only authored data scripts execute here; no browser, network or Node objects are supplied.
    const context = vm.createContext({}, { codeGeneration: { strings: false, wasm: false } });
    new vm.Script(data[2] + '\nJSON.stringify(LESSON.vocab || []);').runInContext(context, { timeout: 300 });
    return JSON.parse(vm.runInContext('JSON.stringify(LESSON.vocab || [])', context, { timeout: 100 }));
  } catch {
    // Older lessons without a separate data block still receive the common dictionary.
    return [];
  }
}

export function createDictionary(source, common = {}) {
  const entries = Object.create(null);
  const clean = value => value.replace(/<[^>]*>/g, '').trim();
  const exampleContains = (term, example) => {
    const words = term.split(' ');
    const first = words[0];
    const irregular = {be:['am','is','are','was','were','been','being'],do:['does','did','done','doing'],have:['has','had','having'],go:['goes','went','gone','going'],make:['made','making'],take:['took','taken','taking'],write:['wrote','written','writing'],speak:['spoke','spoken','speaking']};
    const forms = new Set([first, first+'s', first+'es', first+'ed', first+'d', first+'ing', ...(irregular[first] || [])]);
    if (first.endsWith('y')) {forms.add(first.slice(0,-1)+'ies');forms.add(first.slice(0,-1)+'ied');}
    if (first.endsWith('e')) forms.add(first.slice(0,-1)+'ing');
    if (/[aeiou][b-df-hj-np-tv-z]$/.test(first)) {forms.add(first+first.at(-1)+'ing');forms.add(first+first.at(-1)+'ed');}
    const text = clean(example).replace(/[‘’]/g,"'").toLowerCase();
    const escaped = value => value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
    return [...forms].some(form => new RegExp(`(^|[^a-z])${escaped([form,...words.slice(1)].join(' '))}([^a-z]|$)`,'i').test(text));
  };
  const add = (word, meaning, example, exampleTr) => {
    const term = normalizeTerm(word);
    if (!term || typeof meaning !== 'string' || !meaning.trim() || typeof example !== 'string' || !example.trim()) return;
    if (meaning.length > 400 || example.length > 700) return;
    if (!exampleContains(term,example)) return;
    entries[term] = { meaning: clean(meaning), example: clean(example), ...(exampleTr ? { exampleTr: clean(exampleTr) } : {}) };
  };
  for (const [term, entry] of Object.entries(common)) add(term, entry.meaning, entry.example, entry.exampleTr);
  for (const group of lessonVocabulary(source)) {
    for (const row of group.items || []) {
      if (!Array.isArray(row) || typeof row[0] !== 'string' || typeof row[1] !== 'string' || typeof row[2] !== 'string') continue;
      const [english, turkish, example] = row;
      if (normalizeTerm(english)) add(english, turkish, example);
      else {
        // A parallel list is safe to split only when each English item has its own translation.
        const en = english.split(/\s*[·/]\s*/), tr = turkish.split(/\s*[·/]\s*/);
        // Slash shorthand may omit a shared phrase ('in a good / bad mood'); never invent its missing words.
        if (english.includes('/') && en.some(part => part.trim().includes(' '))) continue;
        if (en.length > 1 && en.length === tr.length) en.forEach((term, i) => add(term, tr[i], example));
      }
    }
  }
  return entries;
}

export function instrumentWordLookup(source, relativePath, { common = {}, versions = {} } = {}) {
  const normalized = relativePath.replace(/\\/g, '/');
  if (path.posix.isAbsolute(normalized) || normalized.split('/').includes('..')) throw new Error('Dictionary path must stay within the site.');
  if (!/^lessons\/(?:a1|a2|b1)\/.+\.html?$/i.test(normalized)) return source;
  if (source.includes('id="english-word-lookup-data"')) return source;
  const metadata = [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(([, attrs]) => /\bid\s*=\s*['"]lesson-meta['"]/.test(attrs));
  if (metadata && JSON.parse(metadata[2]).wordLookup === false) return source;
  const dictionary = createDictionary(source, common);
  const assets = `${path.posix.relative(path.posix.dirname(normalized), 'assets')}/`;
  const version = name => versions[name] ? `?v=${versions[name]}` : '';
  const json = JSON.stringify(dictionary).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  const injection = `\n<script id="english-word-lookup-data" type="application/json">${json}</script>\n<link rel="stylesheet" href="${assets}word-lookup.css${version('word-lookup.css')}">\n<script id="english-word-lookup-script" src="${assets}word-lookup.js${version('word-lookup.js')}" defer></script>\n`;
  if (!/<\/head\s*>/i.test(source)) throw new Error(`${relativePath}: no head for word lookup.`);
  return source.replace(/<\/head\s*>/i, () => injection + '</head>');
}
