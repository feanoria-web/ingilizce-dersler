import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { SITE_ROOT, LEVELS, listFiles, parseLessonMetadata, readAttributes, readScripts } from './build-catalog.mjs';

function resolveLocalReference(root, fromFile, reference) {
  if (!reference || reference.startsWith('#') || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(reference)) return null;
  if (reference.startsWith('/') || reference.includes('\\')) throw new Error(`${fromFile}: GitHub proje siteleri için göreli bağlantı kullanın: ${reference}`);
  const pathname = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
  const resolved = path.resolve(path.dirname(fromFile), pathname || path.basename(fromFile));
  const relative = path.relative(root, resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`${fromFile}: bağlantı site dışına çıkıyor: ${reference}`);
  return resolved;
}

async function checkReferences(root, file, html) {
  for (const match of html.matchAll(/<(?:script|link|img|a|iframe|source)\b([^>]*)>/gi)) {
    const attributes = readAttributes(match[1]);
    const reference = attributes.src ?? attributes.href;
    const resolved = resolveLocalReference(root, file, reference);
    if (resolved) {
      try { await fs.access(resolved); }
      catch { throw new Error(`${path.relative(root, file)}: bağlantı bulunamadı: ${reference}`); }
    }
  }
}

function checkJavaScript(source, label, isModule = false) {
  if (isModule) {
    const result = spawnSync(process.execPath, ['--check', '--input-type=module'], { input: source, encoding: 'utf8' });
    if (result.error || result.status !== 0) throw new Error(`${label}: ${result.error?.message ?? result.stderr.trim()}`);
  } else {
    try { new vm.Script(source, { filename: label }); }
    catch (error) { throw new Error(`${label}: JavaScript sözdizimi hatası: ${error.message}`); }
  }
}

function checkInlineScripts(html, label) {
  for (const [index, script] of readScripts(html).entries()) {
    if (script.attributes.src) continue;
    const type = (script.attributes.type ?? '').toLowerCase().split(';', 1)[0].trim();
    if (type && !['text/javascript', 'application/javascript', 'module'].includes(type)) continue;
    checkJavaScript(script.body, `${label} (script ${index + 1})`, type === 'module');
  }
}

async function readCatalog(root) {
  const file = path.join(root, 'assets', 'catalog.js');
  const context = vm.createContext({ window: {} });
  new vm.Script(await fs.readFile(file, 'utf8'), { filename: 'catalog.js' }).runInContext(context, { timeout: 1000 });
  const catalog = context.window.LESSON_CATALOG;
  if (!Array.isArray(catalog)) throw new Error('assets/catalog.js içinde window.LESSON_CATALOG dizisi bulunamadı.');
  return catalog;
}

export async function checkSite(root = SITE_ROOT) {
  const catalog = await readCatalog(root);
  const ids = new Set();
  const urls = new Set();
  for (const lesson of catalog) {
    if (!lesson || typeof lesson !== 'object' || !LEVELS.includes(lesson.level?.toLowerCase())) throw new Error('Katalogda geçersiz seviye var.');
    if (typeof lesson.id !== 'string' || !lesson.id || ids.has(lesson.id)) throw new Error(`Katalogda boş veya tekrarlanan kimlik: ${lesson.id}`);
    if (typeof lesson.title !== 'string' || !lesson.title.trim()) throw new Error(`${lesson.id}: ders başlığı boş.`);
    if (typeof lesson.description !== 'string' || typeof lesson.date !== 'string' || typeof lesson.duration !== 'string') throw new Error(`${lesson.id}: açıklama, tarih ve süre metin olmalı.`);
    if ((lesson.number !== null && (!Number.isInteger(lesson.number) || lesson.number < 1)) || !Number.isFinite(lesson.order) || lesson.order < 0) throw new Error(`${lesson.id}: ders numarası veya sırası geçersiz.`);
    if (!Array.isArray(lesson.tags) || lesson.tags.some((tag) => typeof tag !== 'string' || !tag.trim())) throw new Error(`${lesson.id}: etiketler geçersiz.`);
    if (typeof lesson.url !== 'string' || urls.has(lesson.url) || /[?#\\]/.test(lesson.url)) throw new Error(`${lesson.id}: ders bağlantısı geçersiz veya tekrarlı.`);
    const decoded = decodeURIComponent(lesson.url);
    const segments = decoded.split('/');
    if (segments[0] !== 'lessons' || segments[1] !== lesson.level.toLowerCase() || segments.some((segment) => !segment || segment === '.' || segment === '..') || !/\.html?$/i.test(decoded)) {
      throw new Error(`${lesson.id}: ders bağlantısı doğru seviye klasöründe olmalı: ${lesson.url}`);
    }
    const file = resolveLocalReference(root, path.join(root, 'index.html'), lesson.url);
    const html = await fs.readFile(file, 'utf8');
    parseLessonMetadata(html, decoded);
    checkInlineScripts(html, decoded);
    ids.add(lesson.id);
    urls.add(lesson.url);
  }
  const lessonFiles = (await listFiles(path.join(root, 'lessons'))).filter((file) => /\.html?$/i.test(file));
  if (lessonFiles.length !== catalog.length) throw new Error('Ders dosyaları ile katalog farklı. Önce npm run catalog çalıştırın.');
  for (const file of lessonFiles) {
    const url = path.relative(root, file).split(path.sep).map(encodeURIComponent).join('/');
    if (!urls.has(url)) throw new Error(`Katalogda bulunmayan ders: ${path.relative(root, file)}`);
  }
  for (const name of ['index.html', 'admin.html', '404.html']) {
    const file = path.join(root, name);
    const html = await fs.readFile(file, 'utf8');
    checkInlineScripts(html, name);
    await checkReferences(root, file, html);
  }
  for (const file of (await listFiles(path.join(root, 'assets'))).filter((entry) => /\.(?:js|mjs)$/i.test(entry))) {
    const source = await fs.readFile(file, 'utf8');
    checkJavaScript(source, path.relative(root, file), /\.mjs$/i.test(file) || /(^|\n)\s*(?:import\s|export\s)/.test(source));
  }
  await fs.access(path.join(root, '.nojekyll'));
  console.log(`Site doğrulandı: ${catalog.length} ders; bağlantılar ve JavaScript sözdizimi geçerli (${path.basename(root)}).`);
  return catalog.length;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--root' && args[1])) throw new Error('Kullanım: node scripts/check-site.mjs [--root _site]');
    await checkSite(args[1] ? path.resolve(SITE_ROOT, args[1]) : SITE_ROOT);
  } catch (error) {
    console.error(`Site doğrulanamadı: ${error.message}`);
    process.exitCode = 1;
  }
}
