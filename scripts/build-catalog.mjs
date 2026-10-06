import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const SITE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEVELS = ['a1', 'a2', 'b1'];
const collator = new Intl.Collator('tr', { numeric: true, sensitivity: 'base' });

export function readAttributes(source) {
  const attributes = Object.create(null);
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

export function readScripts(html) {
  return Array.from(html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi), (match) => ({
    attributes: readAttributes(match[1]),
    body: match[2],
  }));
}

function decodeText(value) {
  const entities = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' };
  return value.replace(/<[^>]*>/g, '').replace(/&(#x[\da-f]+|#\d+|\w+);/gi, (whole, entity) => {
    if (entity.startsWith('#')) {
      const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
      return code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return entities[entity.toLowerCase()] ?? whole;
  }).replace(/\s+/g, ' ').trim();
}

function metadataError(file, message) {
  throw new Error(`${file}: ${message}`);
}

function textValue(metadata, key, fallback, file, maxLength) {
  const value = metadata[key];
  if (value === undefined || value === null) return fallback;
  if (typeof value !== 'string') metadataError(file, `lesson-meta.${key} metin olmalı.`);
  const cleaned = value.trim();
  if (cleaned.length > maxLength) metadataError(file, `lesson-meta.${key} en fazla ${maxLength} karakter olabilir.`);
  return cleaned || fallback;
}

export function parseLessonMetadata(html, file = 'ders.html') {
  const blocks = readScripts(html).filter(({ attributes }) => attributes.id === 'lesson-meta');
  if (blocks.length > 1) metadataError(file, 'Tek bir lesson-meta bloğu kullanın.');
  let metadata = {};
  if (blocks.length) {
    if (blocks[0].attributes.type?.toLowerCase() !== 'application/json') {
      metadataError(file, 'lesson-meta bloğunda type="application/json" olmalı.');
    }
    try { metadata = JSON.parse(blocks[0].body); }
    catch (error) { metadataError(file, `lesson-meta geçerli JSON değil: ${error.message}`); }
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      metadataError(file, 'lesson-meta bir JSON nesnesi olmalı.');
    }
  }
  const filenameTitle = path.basename(file, path.extname(file)).replace(/[-_]+/g, ' ');
  const htmlTitle = decodeText(html.match(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i)?.[1] ?? '');
  const descriptionTag = Array.from(html.matchAll(/<meta\b([^>]*)>/gi), (match) => readAttributes(match[1]))
    .find((attributes) => attributes.name?.toLowerCase() === 'description');
  const result = {
    title: textValue(metadata, 'title', htmlTitle || filenameTitle, file, 240),
    description: textValue(metadata, 'description', decodeText(descriptionTag?.content ?? ''), file, 1200),
    date: textValue(metadata, 'date', '', file, 10),
    duration: '',
    tags: [],
  };
  for (const key of ['number', 'order']) {
    if (metadata[key] === undefined) continue;
    if (metadata[key] === null) {
      if (key === 'number') result.number = null;
      continue;
    }
    if (typeof metadata[key] !== 'number' || !Number.isFinite(metadata[key]) || metadata[key] < (key === 'number' ? 1 : 0) || (key === 'number' && !Number.isInteger(metadata[key]))) {
      metadataError(file, `lesson-meta.${key} ${key === 'number' ? 'pozitif tam sayı' : 'sıfır veya daha büyük bir sayı'} olmalı.`);
    }
    result[key] = metadata[key];
  }
  if (result.date) {
    const date = new Date(`${result.date}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(result.date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== result.date) {
      metadataError(file, 'lesson-meta.date YYYY-AA-GG biçiminde gerçek bir tarih olmalı.');
    }
  }
  if (typeof metadata.duration === 'number') {
    if (!Number.isFinite(metadata.duration) || metadata.duration <= 0) metadataError(file, 'lesson-meta.duration pozitif dakika sayısı olmalı.');
    result.duration = `${metadata.duration} dk`;
  } else {
    result.duration = textValue(metadata, 'duration', '', file, 80);
  }
  if (metadata.tags !== undefined && metadata.tags !== null) {
    if (!Array.isArray(metadata.tags) || metadata.tags.some((tag) => typeof tag !== 'string' || !tag.trim() || tag.trim().length > 80)) {
      metadataError(file, 'lesson-meta.tags boş olmayan metinlerden oluşan bir dizi olmalı.');
    }
    result.tags = [...new Set(metadata.tags.map((tag) => tag.trim()))];
  }
  return result;
}

export async function listFiles(directory) {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`${fullPath}: sembolik bağlantılar desteklenmiyor.`);
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory()) files.push(...await listFiles(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files.sort((left, right) => collator.compare(left, right) || left.localeCompare(right));
}

export async function collectLessons(root = SITE_ROOT) {
  const lessonsRoot = path.join(root, 'lessons');
  await fs.mkdir(lessonsRoot, { recursive: true });
  for (const level of LEVELS) {
    const directory = path.join(lessonsRoot, level);
    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, '.gitkeep'), '', { flag: 'a' });
  }
  for (const entry of await fs.readdir(lessonsRoot, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (!entry.isDirectory() || !LEVELS.includes(entry.name)) {
      throw new Error(`lessons/${entry.name}: dersler lessons/a1, lessons/a2 veya lessons/b1 klasöründe olmalı.`);
    }
  }
  const catalog = [];
  for (const level of LEVELS) {
    const directory = path.join(lessonsRoot, level);
    const files = (await listFiles(directory)).filter((file) => /\.html?$/i.test(file));
    const records = [];
    for (const [index, file] of files.entries()) {
      const relative = path.relative(root, file).split(path.sep).join('/');
      const metadata = parseLessonMetadata(await fs.readFile(file, 'utf8'), relative);
      records.push({
        id: relative.replace(/^lessons\//, '').replace(/\.html?$/i, ''),
        level: level.toUpperCase(),
        title: metadata.title,
        description: metadata.description,
        number: Object.hasOwn(metadata, 'number') ? metadata.number : index + 1,
        order: metadata.order ?? index + 1,
        date: metadata.date,
        duration: metadata.duration,
        tags: metadata.tags,
        url: relative.split('/').map(encodeURIComponent).join('/'),
      });
    }
    records.sort((left, right) => left.order - right.order || collator.compare(left.url, right.url));
    catalog.push(...records);
  }
  const ids = new Set();
  for (const lesson of catalog) {
    if (ids.has(lesson.id)) throw new Error(`Tekrarlanan ders kimliği: ${lesson.id}`);
    ids.add(lesson.id);
  }
  return catalog;
}

async function stageSite(output, root) {
  if (output !== '_site') throw new Error('--output yalnızca _site olabilir.');
  const target = path.resolve(root, output);
  const relative = path.relative(root, target);
  if (relative !== '_site' || target === path.resolve(root)) {
    throw new Error('--output site kökünde _site klasörü olmalı.');
  }
  for (const name of ['index.html', '404.html']) await fs.access(path.join(root, name));
  // Only the checked output directory is replaced; source and developer files stay outside it.
  await fs.rm(target, { recursive: true, force: true });
  await fs.mkdir(target, { recursive: true });
  const localOnlyAssets = new Set(['assets/admin.js', 'assets/config.js']);
  for (const name of ['index.html', '404.html', 'assets', 'lessons']) {
    await fs.cp(path.join(root, name), path.join(target, name), {
      recursive: true,
      filter: (file) => !path.basename(file).startsWith('.') && !localOnlyAssets.has(path.relative(root, file).split(path.sep).join('/')),
    });
  }
  await fs.writeFile(path.join(target, '.nojekyll'), '');
}

export async function buildCatalog({ root = SITE_ROOT, output } = {}) {
  const catalog = await collectLessons(root);
  await fs.mkdir(path.join(root, 'assets'), { recursive: true });
  const json = JSON.stringify(catalog, null, 2).replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  await fs.writeFile(path.join(root, 'assets', 'catalog.js'), `// Otomatik üretilir. Dersleri lessons/a1, lessons/a2 ve lessons/b1 klasörlerine ekleyin.\nwindow.LESSON_CATALOG = ${json};\n`);
  if (output) await stageSite(output, root);
  console.log(`Katalog hazır: ${catalog.length} ders${output ? `; yayın dosyaları: ${output}` : ''}.`);
  return catalog;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args.length && !(args.length === 2 && args[0] === '--output' && args[1])) {
      throw new Error('Kullanım: node scripts/build-catalog.mjs [--output _site]');
    }
    await buildCatalog({ output: args[1] });
  } catch (error) {
    console.error(`Katalog oluşturulamadı: ${error.message}`);
    process.exitCode = 1;
  }
}
