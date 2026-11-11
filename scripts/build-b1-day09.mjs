import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {assertPublicLessonHtml} from './extract-teacher-guides.mjs';

const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const SOURCE=path.join(ROOT,'b1-day09');
const TARGET=path.join(ROOT,'lessons','b1','day-09.html');
const text=value=>typeof value==='string'&&value.trim().length>0;
const object=value=>value&&typeof value==='object'&&!Array.isArray(value);
const fail=message=>{throw new Error(`B1 dokuzuncu ders: ${message}`);};
const safeJson=value=>JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
const escape=value=>String(value).replace(/[&"<>']/g,char=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;',"'":'&#39;'}[char]));

export function validateDay09(lesson,template) {
  if(!object(lesson)||!object(lesson.meta)||lesson.meta.level!=='B1')fail('B1 ders bilgileri gerekli.');
  for(const key of ['school','teacher','day','title','titleTR','sub','tagline'])if(!text(lesson.meta[key]))fail(`meta.${key} eksik.`);
  if(!Array.isArray(lesson.meta.heroTiles)||!lesson.meta.heroTiles.length||lesson.meta.heroTiles.some(row=>!Array.isArray(row)||row.length!==2||row.some(value=>!text(value))))fail('Ana ekran örnekleri gerekli.');
  if(!Array.isArray(lesson.blocks)||lesson.blocks.length!==3||lesson.blocks.some((block,index)=>block.n!==index+1||block.minutes!==60||!text(block.title)||!text(block.goal)))fail('Üç sıralı, altmış dakikalık blok gerekli.');
  if(!Array.isArray(lesson.outcomes)||lesson.outcomes.length<4||lesson.outcomes.some(value=>!text(value)))fail('Dört zaman için kazanımlar gerekli.');
  if(!Array.isArray(lesson.grammarTargets)||lesson.grammarTargets.length<4||lesson.grammarTargets.some(row=>!Array.isArray(row)||row.length!==3||row.some(value=>!text(value))))fail('Dil bilgisi hedefleri gerekli.');
  if(!Array.isArray(lesson.screens)||!lesson.screens.length)fail('Ders ekranları gerekli.');
  if(!Array.isArray(lesson.teacherNotes)||lesson.teacherNotes.length)fail('Öğretmen notları öğrenci dersine konulamaz.');
  const renderers=new Set([...template.matchAll(/\bR\.([a-zA-Z]\w*)\s*=/g)].map(match=>match[1]));
  const ids=new Set(),steps=new Set(),readingIds=new Set();
  let questionCount=0;
  for(const screen of lesson.screens) {
    if(!text(screen.id)||!/^[-a-z0-9]+$/.test(screen.id)||ids.has(screen.id))fail(`Tekrarlanan veya geçersiz ekran: ${screen.id}`);
    ids.add(screen.id);
    if(!Number.isInteger(screen.block)||screen.block<0||screen.block>3||!Number.isInteger(screen.min)||screen.min<0)fail(`${screen.id}: blok veya süre geçersiz.`);
    if(!text(screen.title)||!text(screen.titleTR))fail(`${screen.id}: başlık eksik.`);
    if(screen.block>0&&screen.type!=='break'&&!screen.extra) {
      if(!Number.isInteger(screen.step)||screen.step<1||steps.has(screen.step)||screen.min<=0)fail(`${screen.id}: adım ve süre gerekli.`);
      steps.add(screen.step);
    }
    if(screen.type==='break')continue;
    if(screen.type==='vocab')continue;
    if(!Array.isArray(screen.sections)||(!screen.sections.length&&screen.id!=='summary'))fail(`${screen.id}: içerik eksik.`);
    for(const section of screen.sections) {
      if(!renderers.has(section.type))fail(`${screen.id}: desteklenmeyen bileşen ${section.type}.`);
      if(section.type==='explain'&&(!Array.isArray(section.paras)||!section.paras.length||section.paras.some(value=>!text(value))))fail(`${screen.id}: açıklama metni eksik.`);
      if(section.type==='choice') {
        if(!Array.isArray(section.items)||!section.items.length)fail(`${screen.id}: seçenekli soru eksik.`);
        for(const item of section.items) {
          const options=item.o||section.options;
          if(!text(item.q)||!text(item.why)||!Array.isArray(options)||options.length<3||options.length>5||options.some(value=>!text(value))||new Set(options.map(value=>value.trim().toLowerCase())).size!==options.length||!Number.isInteger(item.a)||item.a<0||item.a>=options.length)fail(`${screen.id}: soru, farklı seçenekler, cevap veya açıklama geçersiz.`);
          questionCount++;
        }
      }
      if(section.type==='gap')for(const item of section.items||[]) {
        const blanks=[...(item.q||'').matchAll(/_{2,}/g)].length;
        if(!text(item.q)||!blanks||!Array.isArray(item.a)||item.a.length!==blanks||item.a.some(value=>!text(value))||!text(item.why))fail(`${screen.id}: boşluk ve cevap sayısı uyuşmuyor.`);
        questionCount+=blanks;
      }
      if(section.type==='fix')for(const item of section.items||[]) {
        if(!text(item.w)||!Array.isArray(item.r)||!item.r.length||item.r.some(value=>!text(value))||!text(item.why))fail(`${screen.id}: düzeltme sorusu veya gerekçesi eksik.`);
        questionCount++;
      }
      if(section.type==='reading') {
        if(!text(section.id)||readingIds.has(section.id)||!Array.isArray(section.paragraphs)||!section.paragraphs.length||section.paragraphs.some(value=>!text(value))||!object(section.marks)||!object(section.columns))fail(`${screen.id}: okuma kimliği veya metni geçersiz.`);
        readingIds.add(section.id);
        for(const [key,mark] of Object.entries(section.marks))if(!/^[a-z]$/.test(key)||!text(mark.label)||!text(mark.tr)||!text(mark.cls)||!text(section.columns[key]))fail(`${screen.id}: okuma işaretleri eksik.`);
        for(const paragraph of section.paragraphs)for(const [,key]of paragraph.matchAll(/\{([a-z])\|[^}]+\}/g))if(!section.marks[key])fail(`${screen.id}: bilinmeyen okuma işareti ${key}.`);
        for(const item of [...(section.questions||[]),...(section.rule||[])])if(!text(item.q)||!text(item.a))fail(`${screen.id}: açıklamalı okuma sorusu eksik.`);
      }
      if(section.type==='table'&&(!Array.isArray(section.head)||!section.head.length||!Array.isArray(section.rows)||section.rows.some(row=>!Array.isArray(row)||row.length!==section.head.length||row.some(value=>!text(value)))))fail(`${screen.id}: tablo sütunları uyuşmuyor.`);
      if(section.type==='examples'&&(!Array.isArray(section.items)||section.items.some(row=>!Array.isArray(row)||!text(row[0])||!text(row[1]))))fail(`${screen.id}: iki dilli örnek gerekli.`);
      if(['model','modelHidden'].includes(section.type)&&!text(section.text))fail(`${screen.id}: model metni gerekli.`);
      if(section.type==='writer') {
        if(!Array.isArray(section.target)||section.target.length!==2||!section.target.every(Number.isInteger)||section.target[0]<1||section.target[1]<section.target[0]||!Array.isArray(section.checks))fail(`${screen.id}: yazma hedefi geçersiz.`);
        for(const check of section.checks)try{if(!text(check.label)||!text(check.re))throw new Error();new RegExp(check.re,'i');}catch{fail(`${screen.id}: yazma kontrolü geçersiz.`);}
      }
    }
  }
  for(const block of lesson.blocks)if(lesson.screens.filter(screen=>screen.block===block.n&&screen.type!=='break'&&!screen.extra).reduce((sum,screen)=>sum+screen.min,0)!==block.minutes)fail(`${block.n}. bloğun süreleri altmış dakika olmalı.`);
  const breaks=lesson.screens.filter(screen=>screen.type==='break');
  if(breaks.length!==2||breaks.some((screen,index)=>screen.block!==index+1||screen.min!==10))fail('İlk iki bloğun ardından onar dakikalık mola gerekli.');
  if(!ids.has('summary')||!ids.has('vocab'))fail('Özet ve ifade bankası gerekli.');
  for(const [id,label]of lesson.homeLinks||[])if(!ids.has(id)||!text(label))fail(`Geçersiz ana ekran bağlantısı: ${id}`);
  for(const step of steps)if(!text(lesson.stepNames?.[step]))fail(`${step}. adımın adı eksik.`);
  if(!Array.isArray(lesson.vocab)||!lesson.vocab.length||lesson.vocab.some(group=>!text(group.cat)||!Array.isArray(group.items)||!group.items.length||group.items.some(row=>!Array.isArray(row)||row.length<3||row.slice(0,3).some(value=>!text(value)))))fail('Örnekli İngilizce–Türkçe ifade bankası gerekli.');
  if(/<script\b|<[^>]*\bon[a-z]+\s*=|javascript:/i.test(JSON.stringify(lesson)))fail('İçerikte çalıştırılabilir HTML bulunamaz.');
  return {screens:lesson.screens.length,questions:questionCount,words:lesson.vocab.reduce((sum,group)=>sum+group.items.length,0)};
}

export async function loadDay09() {
  const [base,template]=await Promise.all([fs.readFile(path.join(SOURCE,'lesson.json'),'utf8').then(JSON.parse),fs.readFile(path.join(SOURCE,'template.html'),'utf8')]);
  const data=await Promise.all([1,2,3].map(number=>fs.readFile(path.join(SOURCE,`block-${number}.json`),'utf8').then(JSON.parse)));
  const screens=[];
  for(const [index,block]of data.entries()) {
    if(!Array.isArray(block.screens)||!Array.isArray(block.vocab))fail(`block-${index+1}.json: screens ve vocab dizileri gerekli.`);
    if(block.screens.some(screen=>screen.block!==index+1||screen.type==='break'))fail(`block-${index+1}.json: yalnız kendi bloğunun ders ekranları bulunmalı.`);
    screens.push(...block.screens);
    if(index<2)screens.push({id:`break${index+1}`,type:'break',block:index+1,min:10,kicker:'Ders arası',title:'Break',titleTR:'Mola · 10 dakika',lead:'Mola sırasında işlediğiniz sayfaların kısa özetlerinden istediklerinizi seçebilirsiniz. Süreyi mola sayfasında 10 veya 15 dakika olarak ayarlayın.',next:base.blocks[index+1].title,art:`Sırada: <b>${base.blocks[index+1].titleTR||base.blocks[index+1].title}</b>`});
  }
  try {
    const extra=JSON.parse(await fs.readFile(path.join(SOURCE,'resources.json'),'utf8'));
    if(!Array.isArray(extra.screens)||extra.screens.some(screen=>screen.block!==0||screen.min!==0))fail('Ek kaynaklar sıfırıncı blokta ve sıfır dakika olmalı.');
    screens.push(...extra.screens);
  }catch(error){if(error.code!=='ENOENT')throw error;}
  if(!Array.isArray(base.sources)||base.sources.length!==3)fail('Tarihî arka plan için üç kaynak gerekli.');
  const sourceLinks=base.sources.map(source=>{
    let url;try{url=new URL(source.url);}catch{fail('Kaynak adresi geçersiz.');}
    if(url.protocol!=='https:'||!['dosim.ktb.gov.tr','ataturkansiklopedisi.gov.tr'].includes(url.hostname)||!text(source.title)||!text(source.note))fail('Resmî tarihî kaynak bağlantısı gerekli.');
    return `<p><a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(source.title)} ↗</a><br>${escape(source.note)}</p>`;
  });
  screens.push({id:'sources',block:0,min:0,kicker:'Kaynak ve hikâye',title:'History and our story',titleTR:'Tarihî arka plan ve kurgu',lead:'Tarihî bilgiler ile İngilizce öğrenmek için kurulan hikâyeyi ayıralım.',sections:[{type:'explain',title:'Gerçek tarih, kurgusal karakterler',titleTR:'Historical background and fiction',paras:['Elif, Mert, Zeynep ve arşiv gönüllüsü Nermin ile Bursa’daki Mahalle Hafıza Sergisi dil öğrenimi için kurgulanmıştır. Ayşe’nin 1933 tarihli defteri gerçek bir arşiv belgesi veya tarihî tanıklık değildir.','Cumhuriyetin ilanı, Harf Devrimi ve Millet Mektepleriyle ilgili kısa tarihî arka plan aşağıdaki resmî kaynaklara dayanır. Okuma metinleri ve örnek cümleler bu ders için özgün hazırlanmıştır.','Sesli okuma düğmeleri metinleri İngilizce seslendirir; kullanılan ses, cihazınızın desteklediği seslerden seçilir. Kurgusal telefon mesajı bir arşiv kaydı değildir.']},{type:'model',title:'Tarihî kaynaklar',text:sourceLinks.join('')}]});
  screens.push({id:'summary',block:0,min:0,kicker:'Özet',title:'Summary',titleTR:'Dört zamanda bir hikâye · konu özetleri',lead:'Dersteki konu anlatımlarını sırayla gözden geçirin. İlgili adıma dönmek için başlığın yanındaki düğmeyi kullanın.',sections:[]},{id:'vocab',type:'vocab',block:0,min:0,kicker:'İfade bankası',title:'Phrase bank',titleTR:'Sergi hikâyesinin kelime ve kalıpları',lead:'İfadeleri arayın, seslendirin ve örnek cümleleriyle tekrar edin.'});
  const {catalog,...settings}=base;
  const lesson={...settings,screens,vocab:data.flatMap(block=>block.vocab),teacherNotes:[]};
  const stats=validateDay09(lesson,template);
  return {lesson,template,stats,catalog:catalog||{title:'Mahalle sergisi · Dört zamanla hikâye anlatma',description:'B1 dokuzuncu ders: Bursa’da bir mahalle sergisi hazırlarken Present Continuous, Past Simple, Past Continuous ve Past Perfect. Geçmişten bugüne eğitim ve mahalle hayatı, yağmurlu bir hazırlık günü, kayıp fotoğraf kutusu; Türkçe açıklamalar, iki dilli örnekler, sesli dinlemeler ve çözümlü alıştırmalar.',number:9,order:9,date:'2026-11-11',duration:180,tags:['Present Continuous','Past Simple','Past Continuous','Past Perfect','Bağlantılı hikâye','Mahalle hayatı']}};
}

export async function renderDay09() {
  const data=await loadDay09();
  const description=String(data.catalog.description).replace(/[&"<>]/g,char=>({'&':'&amp;','"':'&quot;','<':'&lt;','>':'&gt;'}[char]));
  const html=data.template.replace('{{LESSON_DATA}}',()=>safeJson(data.lesson)).replace('{{LESSON_META}}',()=>safeJson(data.catalog)).replace('{{DESCRIPTION}}',()=>description);
  if(/\{\{(?:LESSON_DATA|LESSON_META|DESCRIPTION)\}\}/.test(html))fail('Şablon yer tutucuları tamamlanmadı.');
  for(const [,attributes,code]of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi))if(!/application\/(?:json|ld\+json)/i.test(attributes)&&code.trim())new vm.Script(code);
  assertPublicLessonHtml(html,'b1/day-09');
  return {...data,html};
}

export async function buildB1Day09() {
  const {html,stats}=await renderDay09();
  await fs.writeFile(TARGET,html,'utf8');
  console.log(`B1 dokuzuncu ders hazır: ${stats.screens} ekran, ${stats.questions} otomatik kontrollü soru, ${stats.words} ifade.`);
  return stats;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildB1Day09();
