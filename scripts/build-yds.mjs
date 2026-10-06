import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = path.join(root, 'yds-src');
const fail = message => { throw new Error(`YDS içerik kontrolü: ${message}`); };
const hasText = value => typeof value === 'string' && value.trim().length > 0;

export function validateContent(units) {
  if (!Array.isArray(units) || units.length !== 12) fail('12 ünite gerekli.');
  const ids = new Set();
  function unique(id) { if (!hasText(id) || !/^u\d{2}(?:-[sqr]\d{2})?$/.test(id) || ids.has(id)) fail(`Geçersiz/tekrarlanan kimlik: ${id}`); ids.add(id); }
  function question(q, unit, reading = false) {
    unique(q.id);
    if (!hasText(q.prompt) || !hasText(q.explanation)) fail(`${q.id}: soru veya açıklama boş.`);
    if (!Array.isArray(q.options) || q.options.length !== 5 || q.options.some(option => !hasText(option)) || new Set(q.options.map(option => option.trim().toLowerCase())).size !== 5) fail(`${q.id}: beş farklı seçenek gerekli.`);
    if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) fail(`${q.id}: cevap 0–4 aralığında olmalı.`);
    if (!reading && (!['grammar','translation','meaning'].includes(q.type) || !unit.sections.some(section => section.id === q.sectionId))) fail(`${q.id}: soru türü veya konu bağlantısı geçersiz.`);
  }
  for (const [index, unit] of units.entries()) {
    if (unit.number !== index + 1 || unit.id !== `u${String(index + 1).padStart(2, '0')}`) fail('Üniteler u01–u12 sırasıyla yer almalı.');
    unique(unit.id);
    for (const key of ['title','subtitle','pages','description']) if (!hasText(unit[key])) fail(`${unit.id}.${key} boş.`);
    if (!Array.isArray(unit.outcomes) || unit.outcomes.length < 3 || unit.outcomes.some(value => !hasText(value))) fail(`${unit.id}: kazanımlar eksik.`);
    if (!Array.isArray(unit.sections) || unit.sections.length < 8) fail(`${unit.id}: en az sekiz kapsamlı konu gerekli.`);
    for (const section of unit.sections) {
      unique(section.id);
      if (!hasText(section.title) || !hasText(section.lead)) fail(`${section.id}: anlatım eksik.`);
      if (!Array.isArray(section.rules) || section.rules.length < 3 || section.rules.some(rule => !hasText(rule))) fail(`${section.id}: kurallar eksik.`);
      if (!Array.isArray(section.examples) || section.examples.length < 2 || section.examples.some(example => !hasText(example.en) || !hasText(example.tr) || !hasText(example.note))) fail(`${section.id}: açıklamalı örnekler eksik.`);
      if (!Array.isArray(section.pitfalls) || section.pitfalls.length < 2 || section.pitfalls.some(value => !hasText(value))) fail(`${section.id}: sık hatalar eksik.`);
      if (section.table && (!Array.isArray(section.table.head) || !section.table.head.length || section.table.head.some(cell=>!hasText(cell)) || !Array.isArray(section.table.rows) || section.table.rows.some(row => !Array.isArray(row) || row.length !== section.table.head.length || row.some(cell=>!hasText(cell))))) fail(`${section.id}: tablo sütunları veya metinleri uyuşmuyor.`);
    }
    if (!Array.isArray(unit.questions) || unit.questions.length < 16) fail(`${unit.id}: en az 16 açıklamalı soru gerekli.`);
    unit.questions.forEach(q => question(q, unit));
    if (new Set(unit.questions.map(q => q.answer)).size < 4) fail(`${unit.id}: cevap seçenekleri dengeli dağılmalı.`);
    if (!Array.isArray(unit.vocabulary) || unit.vocabulary.length < 12 || unit.vocabulary.some(item => ['word','meaning','pos','example'].some(key => !hasText(item[key])))) fail(`${unit.id}: kelime bankası eksik.`);
    if (!unit.reading || !hasText(unit.reading.title) || !hasText(unit.reading.text) || unit.reading.text.trim().split(/\s+/).length < 100 || !Array.isArray(unit.reading.questions) || unit.reading.questions.length < 3) fail(`${unit.id}: okuma çalışması eksik.`);
    unit.reading.questions.forEach(q => question(q, unit, true));
  }
  return units;
}

export async function loadContent() {
  const units = [];
  for (const name of ['units-01-04.json','units-05-08.json','units-09-12.json']) {
    const data = JSON.parse(await fs.readFile(path.join(sourceRoot, 'data', name), 'utf8'));
    if (!Array.isArray(data.units)) fail(`${name}: units dizisi bulunamadı.`);
    units.push(...data.units);
  }
  units.sort((a,b) => a.number - b.number);
  validateContent(units);
  return {
    title: 'YDS Grammar Studio',
    source: { title:'English Grammar Inside and Out', author:'Nesibe Sevgi Öndeş', publisher:'ELS', pages:720 },
    units,
    summary: {
      units: units.length,
      sections: units.reduce((sum,unit) => sum + unit.sections.length,0),
      questions: units.reduce((sum,unit) => sum + unit.questions.length + unit.reading.questions.length,0),
      vocabulary: units.reduce((sum,unit) => sum + unit.vocabulary.length,0),
      readings: units.length,
    },
  };
}

export async function buildYds() {
  const content = await loadContent();
  const [template,css,app] = await Promise.all(['template.html','style.css','app.js'].map(name => fs.readFile(path.join(sourceRoot,name),'utf8')));
  const safeJson = data => JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const metadata = { title:'YDS Grammar Studio · 12 ünite', description:`${content.summary.sections} konu anlatımı, ${content.summary.questions} açıklamalı soru, ${content.summary.readings} akademik okuma ve ${content.summary.vocabulary} kelime kartı.`, number:1,order:1,date:'2026-10-06',duration:'Kendi hızında',tags:['Dil bilgisi','Açıklamalı sorular','Okuma ve kelimeler'] };
  let html = template.replace('{{METADATA}}',()=>safeJson(metadata)).replace('{{STYLE}}',()=>css).replace('{{CONTENT}}',()=>safeJson(content)).replace('{{APP}}',()=>app);
  if (/\{\{(?:METADATA|STYLE|CONTENT|APP)\}\}/.test(html)) fail('Şablon yer tutucuları tamamlanmadı.');
  const target = path.join(root,'lessons','yds','grammar-studio.html');
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,html);
  console.log(`YDS hazır: ${content.summary.units} ünite, ${content.summary.sections} konu, ${content.summary.questions} soru, ${content.summary.vocabulary} kelime.`);
  return content;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildYds(); } catch(error) { console.error(error.message); process.exitCode=1; }
}
