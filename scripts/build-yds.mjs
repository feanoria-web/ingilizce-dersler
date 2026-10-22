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

export function validateSupplement(data,units) {
  if (!data || !Array.isArray(data.capsules) || data.capsules.length !== 72 || !Array.isArray(data.questions) || data.questions.length !== 100) fail('Ek kaynakta 72 hap bilgi ve 100 soru gerekli.');
  const unitMap = new Map(units.map(unit=>[unit.id,unit]));
  const topicMap = new Map();
  const ids = new Set(units.flatMap(unit=>[unit.id,...unit.sections.map(item=>item.id),...unit.questions.map(item=>item.id),...unit.reading.questions.map(item=>item.id)]));
  const text = (value,min=1) => hasText(value) && value.trim().length >= min;
  const unique = (id,pattern) => { if (!text(id) || !pattern.test(id) || ids.has(id)) fail(`Ek kaynakta geçersiz/tekrarlanan kimlik: ${id}`); ids.add(id); };
  for (const capsule of data.capsules) {
    unique(capsule.id,/^hb\d{2}$/);
    if (!unitMap.has(capsule.unitId)) fail(`${capsule.id}: ünite bağlantısı geçersiz.`);
    for (const key of ['title','lead','formula','signal','decision']) if (!text(capsule[key],5)) fail(`${capsule.id}.${key}: açıklama eksik.`);
    for (const [key,min] of [['rules',3],['pitfalls',2]]) if (!Array.isArray(capsule[key]) || capsule[key].length<min || capsule[key].some(item=>!text(item,12))) fail(`${capsule.id}.${key}: kapsamlı maddeler gerekli.`);
    if (capsule.rules.length>5) fail(`${capsule.id}: ilk tekrar için en fazla beş kural gerekli.`);
    if (!Array.isArray(capsule.examples) || capsule.examples.length<2 || capsule.examples.some(example=>['en','tr','note'].some(key=>!text(example[key],8)))) fail(`${capsule.id}: iki açıklamalı örnek gerekli.`);
    topicMap.set(capsule.id,capsule);
  }
  for(let index=1;index<=72;index++) if(!topicMap.has(`hb${String(index).padStart(2,'0')}`)) fail('Hap bilgi kimlikleri hb01–hb72 olmalı.');
  const answers = Array(5).fill(0);
  const questionIds = new Set();
  const prompts = new Set();
  for (const q of data.questions) {
    unique(q.id,/^hq\d{3}$/); questionIds.add(q.id);
    const unit=unitMap.get(q.unitId),topic=topicMap.get(q.topicId);
    if (!unit || !unit.sections.some(section=>section.id===q.sectionId) || !topic || topic.unitId!==q.unitId) fail(`${q.id}: konu/ünite bağlantısı geçersiz.`);
    if (!['grammar','translation','meaning','reading'].includes(q.type) || !['orta','ileri'].includes(q.difficulty) || !text(q.format,3)) fail(`${q.id}: tür veya zorluk geçersiz.`);
    if (!text(q.prompt,20) || !text(q.explanation,45) || !text(q.translation,15)) fail(`${q.id}: soru, çözüm veya Türkçe anlam eksik.`);
    const prompt=q.prompt.trim().replace(/\s+/g,' ').toLowerCase();
    if(prompts.has(prompt)) fail(`${q.id}: soru metni tekrarlanıyor.`);
    prompts.add(prompt);
    if (!Array.isArray(q.options) || q.options.length!==5 || q.options.some(option=>!text(option)) || new Set(q.options.map(option=>option.trim().toLowerCase())).size!==5) fail(`${q.id}: beş farklı seçenek gerekli.`);
    if (!Number.isInteger(q.answer) || q.answer<0 || q.answer>4) fail(`${q.id}: cevap 0–4 aralığında olmalı.`);
    if (!Array.isArray(q.optionExplanations) || q.optionExplanations.length!==5 || q.optionExplanations.some(explanation=>!text(explanation,20))) fail(`${q.id}: her seçeneğin ayrı açıklaması gerekli.`);
    answers[q.answer]++;
  }
  for(let index=1;index<=100;index++) if(!questionIds.has(`hq${String(index).padStart(3,'0')}`)) fail('Yeni soru kimlikleri hq001–hq100 olmalı.');
  if (answers.some(count=>count<10 || count>30)) fail('Yeni sorularda doğru cevaplar A–E arasında dengeli dağılmalı.');
  for (const unit of units) if (data.capsules.filter(item=>item.unitId===unit.id).length!==6 || !data.questions.some(item=>item.unitId===unit.id)) fail(`${unit.id}: altı hap bilgi ve ilgili sorular gerekli.`);
  for (const capsule of data.capsules) if (!data.questions.some(q=>q.topicId===capsule.id)) fail(`${capsule.id}: en az bir ilgili soru gerekli.`);
  if (new Set(data.questions.map(q=>q.type)).size<3) fail('Yeni sorular dil bilgisi, anlam ve okuma/çeviri becerilerini birlikte çalıştırmalı.');
  return data;
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
  const supplement = {capsules:[],questions:[]};
  for (const name of ['capsules-01-06.json','capsules-07-12.json']) {
    const data = JSON.parse(await fs.readFile(path.join(sourceRoot,'data',name),'utf8'));
    if (!Array.isArray(data.capsules) || !Array.isArray(data.questions)) fail(`${name}: hap bilgi veya soru dizisi eksik.`);
    supplement.capsules.push(...data.capsules);
    supplement.questions.push(...data.questions);
  }
  validateSupplement(supplement,units);
  return {
    title: 'YDS Grammar Studio',
    source: { title:'English Grammar Inside and Out', author:'Nesibe Sevgi Öndeş', publisher:'ELS', pages:720 },
    units,
    supplement,
    summary: {
      units: units.length,
      sections: units.reduce((sum,unit) => sum + unit.sections.length,0),
      questions: units.reduce((sum,unit) => sum + unit.questions.length + unit.reading.questions.length,0),
      vocabulary: units.reduce((sum,unit) => sum + unit.vocabulary.length,0),
      readings: units.length,
      capsules: supplement.capsules.length,
      supplementQuestions: supplement.questions.length,
      totalQuestions: units.reduce((sum,unit) => sum + unit.questions.length + unit.reading.questions.length,0) + supplement.questions.length,
    },
  };
}

export async function buildYds() {
  const content = await loadContent();
  const [template,css,app] = await Promise.all(['template.html','style.css','app.js'].map(name => fs.readFile(path.join(sourceRoot,name),'utf8')));
  const safeJson = data => JSON.stringify(data).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
  const metadata = { title:'YDS Grammar Studio · Hap bilgi ve soru bankası', description:`${content.summary.sections} konu anlatımı, ${content.summary.capsules} hap bilgi kartı, ${content.summary.totalQuestions} açıklamalı soru, ${content.summary.readings} akademik okuma ve ${content.summary.vocabulary} kelime kartı.`, number:1,order:1,date:'2026-10-23',duration:'Kendi hızında',tags:['Hap bilgiler','Açıklamalı sorular','Dil bilgisi','Okuma ve kelimeler'] };
  let html = template.replace('{{METADATA}}',()=>safeJson(metadata)).replace('{{STYLE}}',()=>css).replace('{{CONTENT}}',()=>safeJson(content)).replace('{{APP}}',()=>app);
  if (/\{\{(?:METADATA|STYLE|CONTENT|APP)\}\}/.test(html)) fail('Şablon yer tutucuları tamamlanmadı.');
  const target = path.join(root,'lessons','yds','grammar-studio.html');
  await fs.mkdir(path.dirname(target),{recursive:true});
  await fs.writeFile(target,html);
  console.log(`YDS hazır: ${content.summary.units} ünite, ${content.summary.sections} konu, ${content.summary.capsules} hap bilgi, ${content.summary.totalQuestions} soru, ${content.summary.vocabulary} kelime.`);
  return content;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { await buildYds(); } catch(error) { console.error(error.message); process.exitCode=1; }
}
