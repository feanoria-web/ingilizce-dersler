import path from 'node:path';
import vm from 'node:vm';
import {instrumentYdsBreakReview} from './break-review-yds.mjs';

export const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\{\w\|([^}]+)\}/g, '$1').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim() : '';
const brief = value => { const text=clean(value); return text.length>260 ? text.slice(0,257).replace(/\s+\S*$/, '')+'…' : text; };

export function summarizeScreen(screen) {
  const summary=[], examples=[];
  const add = value => { const t=brief(value); if(t && !summary.includes(t)) summary.push(t); };
  const example = (en,tr='') => { en=clean(en); tr=clean(tr); if(en && en.length<=350 && !examples.some(x=>x.en===en)) examples.push({en,tr}); };
  for(const section of screen.sections || []) {
    if(section.type==='explain') (section.paras || []).slice(0,2).forEach(add);
    if(section.type==='stepper') for(const step of section.steps || []) { (step.p || []).slice(0,1).forEach(add); if(step.en) example(step.en,step.tr); }
    if(section.type==='formula') { add(section.text || section.formula || section.en); }
    if(section.type==='rules') for(const item of section.items || []) add(typeof item==='string' ? item : item.tr || item.text);
    if(section.type==='formTable') for(const row of (section.rows || []).slice(0,2)) {add(row.note);example(row.ex);}
    if(section.type==='examples') for(const item of (section.items || []).slice(0,2)) { if(Array.isArray(item)) example(item[0],item[1]); }
    if(section.type==='trTrap') for(const row of (section.rows || []).slice(0,2)) example(row.right,row.tr);
    if(section.type==='wordGrid') for(const item of (section.items || []).slice(0,3)) if(Array.isArray(item)) add(`${clean(item[0])}: ${clean(item[1])}`);
    if(section.type==='sayTiles') for(const group of (section.groups || []).slice(0,1)) for(const item of (group.items || []).slice(0,3)) add(`${clean(item[1])}: ${clean(item[2])}`);
    if(section.type==='freqScale') for(const item of (section.items || []).slice(0,2)) if(Array.isArray(item)) {add(`${clean(item[0])}: ${clean(item[2])}`);example(item[3]);}
    if(section.type==='choice') for(const item of (section.items || []).slice(0,2)) {if(item.why) add(item.why); const answer=(item.o||section.options||[])[item.a]; if(typeof answer==='string' && typeof item.q==='string' && /_{2,}/.test(item.q)) example(item.q.replace(/_{2,}/,clean(answer)));}
    if(section.type==='teamGame' || section.type==='fix') for(const item of (section.items || []).slice(0,2)) {if(item.why)add(item.why); if(typeof item.r==='string')example(item.r);}
    if(section.type==='dialogue') for(const row of (section.lines || section.items || []).slice(0,2)) {if(Array.isArray(row))example(row[1],row[2]);else if(row.en)example(row.en,row.tr);}
    if(section.type==='table') for(const row of (section.rows || []).slice(0,2)) if(Array.isArray(row)) { if(row.length===2)example(row[0],row[1]); }
  }
  if(!summary.length) add(screen.titleTR || screen.leadTR || screen.lead || screen.title);
  return {summary:summary.slice(0,3),examples:examples.sort((a,b)=>Number(Boolean(b.tr))-Number(Boolean(a.tr))).slice(0,2)};
}

export function componentPages(source) {
  const script=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].find(([,attrs,body])=>!attrs.includes('application/json') && /\bconst LESSON\s*=/.test(body));
  if(!script) return null;
  const context=vm.createContext({}, {codeGeneration:{strings:false,wasm:false}});
  const lesson=JSON.parse(new vm.Script(script[2]+'\nJSON.stringify(LESSON);').runInContext(context,{timeout:500}));
  const known=new Map();
  return lesson.screens.flatMap((screen,index)=>{
    if(!(screen.block>0) || screen.type==='break' || !screen.sections) return [];
    let recap=summarizeScreen(screen);
    const key=screen.step ?? screen.id;
    if(known.has(key) && /practice|game|quiz|cards|drill|chain|bingo|race|auction|interview|survey|speak|writing|write|dictation|check|hunt/i.test(screen.title) && !screen.sections.some(x=>['explain','stepper','formTable'].includes(x.type))) {
      const previous=known.get(key); recap={summary:previous.summary,examples:recap.examples.length?recap.examples:previous.examples};
    }
    if(!known.has(key) || screen.sections.some(x=>['explain','stepper','formTable'].includes(x.type))) known.set(key,recap);
    return [{id:screen.id,index,title:clean(screen.title),...recap}];
  });
}

const legacyBridge = `
;window.EnglishBreakReview?.register({
 pages:boardSlides.flatMap((s,index)=>{
   if(s.tag==='BREAK'||s.type==='break')return [];
   const clean=v=>typeof v==='string'?v.replace(/<[^>]*>/g,'').replace(/\\s+/g,' ').trim():'';
   const summary=[],examples=[];
   const add=v=>{const t=clean(v);if(t&&!summary.includes(t))summary.push(t.length>260?t.slice(0,257)+'…':t)};
   const ex=(en,tr='')=>{en=clean(en);tr=clean(tr);if(en&&en.length<350&&!examples.some(x=>x.en===en))examples.push({en,tr})};
   if(s.type==='rules'||s.type==='cards')for(const item of (s.items||[]).slice(0,3)){if(typeof item==='string')add(item);else{add(item.text||item.rule||item.title);if(item.answer)ex(item.answer,item.tr)}}
   if(s.type==='words')for(const item of (s.items||[]).slice(0,3)){if(typeof item==='string')add(item);else add(item.text||item.word)}
   if(s.lines)for(const item of s.lines.slice(0,2)){if(typeof item==='string')ex(item);else ex(item.text||item.en,item.tr)}
   if(s.type==='quiz'&&s.question){const q=s.question;const a=q.options?.[q.answer];if(a){add(q.explanation||s.tr);ex((q.q||q.prompt||'').replace(/_{2,}/,a))}}
   if(s.text)ex(s.text);
   if(s.paragraphs?.length)ex(s.paragraphs[0]);
   if(!summary.length)add(s.tr||s.title);
   return [{id:s.uid||'board-'+index,index,title:clean(s.title),summary:summary.slice(0,3),examples:examples.slice(0,2)}];
 }),
 getIndex:()=>current==='home'?-1:state.mode==='board'?boardIndex:boardSlides.reduce((last,s,i)=>s.group===current?i:last,-1),
 getBreakTarget:()=>{
   if(state.mode==='board')return boardSlides[boardIndex]?.tag==='BREAK'?document.querySelector('#board-content'):null;
   const activity=Array.isArray(DATA.activities)?DATA.activities.find(a=>String(a.id)===current):null;
   return activity?.kind==='break'||/^review-break-[12]$/.test(current)?document.querySelector('#main .panel')||document.querySelector('#main'):null;
 },
 timer:{set(sec){stopTimer();timerSeconds=sec;paintTime()},start(){startTimer()},stop(){stopTimer()}}
});
`;

export function instrumentBreakReview(source,relativePath,{versions={}}={}) {
  const normalized=relativePath.replace(/\\/g,'/');
  if(path.posix.isAbsolute(normalized)||normalized.split('/').includes('..'))throw new Error('Break review path must stay within the site.');
  if(!/^lessons\/(?:a1|a2|b1|yds)\/.+\.html?$/i.test(normalized)||source.includes('id="english-break-review-script"'))return source;
  if(normalized==='lessons/b1/practice.html') {
    // This older workbook had no actual break pages. Add them between its three teaching blocks.
    const anchor='function initializeBoard(){';
    if(source.split(anchor).length!==2)throw new Error(`${relativePath}: legacy break initializer missing.`);
    source=source.replace(anchor,`lesson.splice(lesson.findIndex(l=>l[0]==='5')+1,0,['review-break-1','Mola · 1. blok sonrası',10,1]);
lesson.splice(lesson.findIndex(l=>l[0]==='10')+1,0,['review-break-2','Mola · 2. blok sonrası',10,2]);
for(const id of ['review-break-1','review-break-2']) {ACTIVITIES[id]=()=>panel('Mola', '<p>Çay molası · İşlediğiniz sayfaların kısa özetlerini seçerek 10 veya 15 dakika tekrar edebilirsiniz.</p>');descriptions[id]='İşlediğiniz konulardan kısa bir tekrar seçin. Keyifli molalar!';}
${anchor}`);
    const deckAnchor="createBoardDeck();if(typeof extendBoardDeck";
    if(source.split(deckAnchor).length!==2)throw new Error(`${relativePath}: legacy break deck anchor missing.`);
    source=source.replace(deckAnchor,`createBoardDeck();for(const id of ['review-break-1','review-break-2'])bAdd(id,'Mola · Küçük bir tekrar','quote',{text:'Çay molası. İşlediğiniz sayfaların özetlerini seçip başlatın.',minutes:10,tag:'BREAK'});if(typeof extendBoardDeck`);
    source=source.replace('const n=lesson.filter(l=>state.done[l[0]]).length;',"const n=lesson.filter(l=>!/^review-break-/.test(l[0])&&state.done[l[0]]).length;");
    source=source.replace("l[0].startsWith('b')?'＋':l[0].padStart(2,'0')","l[0].startsWith('review-break-')?'☕':l[0].startsWith('b')?'＋':l[0].padStart(2,'0')");
    source=source.replace("l[3]===4?'EXTRA PRACTICE':`CHAPTER 0${l[3]} · ACTIVITY ${l[0].padStart(2,'0')}`","l[0].startsWith('review-break-')?'DERS ARASI':l[3]===4?'EXTRA PRACTICE':`CHAPTER 0${l[3]} · ACTIVITY ${l[0].padStart(2,'0')}`");
  }
  const yds=normalized==='lessons/yds/grammar-studio.html';
  const pages=yds?null:componentPages(source);
  let html=source;
  if(yds) html=instrumentYdsBreakReview(source);
  else if(pages) {
    const anchor=/  init\(\);\r?\n\}\)\(\);/g;
    if([...source.matchAll(anchor)].length!==1)throw new Error(`${relativePath}: break review init anchor missing.`);
    const json=JSON.stringify(pages).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');
    html=html.replace(anchor,()=>`  window.EnglishBreakReview?.register({pages:${json},getIndex:()=>st.idx,getBreakTarget:()=>S[st.idx]?.type==='break'?document.querySelector('#main .break-text'):null,timer});\n  init();\n})();`);
  } else if(source.includes('initializeBoard();')&&source.includes('boardSlides')) {
    const anchor=/initializeBoard\(\);(?=(?:(?:if\(typeof initializeExtras[^<]*|initializeExtras\(\);))?\s*<\/script>)/g;
    if([...source.matchAll(anchor)].length!==1)throw new Error(`${relativePath}: board break review anchor missing.`);
    html=html.replace(anchor,()=>`initializeBoard();${legacyBridge}`);
  } else throw new Error(`${relativePath}: no supported break review screen model.`);
  const assets=path.posix.relative(path.posix.dirname(normalized),'assets')+'/';
  const asset=name=>assets+name+(versions[name]?'?v='+versions[name]:'');
  return html.replace(/<\/head\s*>/i,()=>`<link rel="stylesheet" href="${asset('break-review.css')}">\n<script id="english-break-review-script" src="${asset('break-review.js')}"></script>\n</head>`);
}
