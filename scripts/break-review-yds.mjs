const marker = '/* english-break-review-yds-adapter */';
const clean = value => typeof value === 'string' ? value.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';
const brief = value => { const text=clean(value); return text.length>260 ? text.slice(0,257).replace(/\s+\S*$/, '')+'…' : text; };
const safeJson = value => JSON.stringify(value).replace(/</g,'\\u003c').replace(/\u2028/g,'\\u2028').replace(/\u2029/g,'\\u2029');

/** Summaries contain only the published grammar rules and correct bilingual examples. */
export function ydsPages(source) {
  const block=[...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)].find(([,attrs])=>/\bid\s*=\s*['"]study-data['"]/i.test(attrs));
  if(!block) throw new Error('YDS break review: study-data is missing.');
  const data=JSON.parse(block[2]);
  if(!Array.isArray(data.units)||!data.units.length) throw new Error('YDS break review: units are missing.');
  let index=0;
  return data.units.flatMap(unit=>{
    if(!Array.isArray(unit.sections)) throw new Error('YDS break review: sections are missing.');
    return unit.sections.map(section=>{
      if(!/^u\d{2}-s\d{2}$/.test(section.id)||!clean(section.title)) throw new Error('YDS break review: invalid topic.');
      const rules=(section.rules||[]).map(brief).filter(Boolean);
      const summary=[...new Set(rules.length ? rules : [brief(section.lead)])].filter(Boolean).slice(0,3);
      const examples=(section.examples||[]).map(item=>({en:clean(item.en),tr:clean(item.tr)})).filter(item=>item.en&&item.tr).slice(0,2);
      if(!summary.length||!examples.length) throw new Error(`YDS break review: ${section.id} has no usable recap.`);
      return {id:section.id,index:index++,unitId:unit.id,title:`${String(unit.number).padStart(2,'0')} · ${clean(section.title)}`,summary,examples};
    });
  });
}

function replaceOnce(source,anchor,replacement,label) {
  const count=typeof anchor==='string' ? source.split(anchor).length-1 : [...source.matchAll(anchor)].length;
  if(count!==1) throw new Error(`YDS break review: ${label} anchor changed (${count}).`);
  return source.replace(anchor,()=>replacement);
}

/** Adds a real break route; the summary control is mounted only inside that route. */
export function instrumentYdsBreakReview(source) {
  if(source.includes(marker)) return source;
  const pages=ydsPages(source);
  const bridge=`  ${marker}
  const BREAK_REVIEW_PAGES=${safeJson(pages)};
  let breakReviewCutoff=null;
  function breakReviewIndex() {
    if(Number.isInteger(breakReviewCutoff)) return breakReviewCutoff;
    const last=BREAK_REVIEW_PAGES.findIndex(page=>page.id===state.last?.sectionId);
    return last>=0?last:0;
  }
  function breakReviewPage() {
    const index=breakReviewIndex();
    const last=BREAK_REVIEW_PAGES[index]||BREAK_REVIEW_PAGES[0];
    return pageHead('DERS ARASI / YDS','Mola','İşlediğiniz son konuyu belirleyin. Ardından özetlenecek konuları ve 10 ya da 15 dakikalık mola süresini seçin.')+
      '<div class="unit-toolbar"><div class="unit-select"><label for="yds-break-cutoff">Bu konuya kadar</label><select id="yds-break-cutoff" data-change="breakreview-cutoff">'+BREAK_REVIEW_PAGES.map(page=>'<option value="'+page.index+'" '+(page.index===index?'selected':'')+'>'+String(page.index+1).padStart(3,'0')+' · '+esc(page.title)+'</option>').join('')+'</select></div></div>'+
      '<section id="yds-break-review-target" class="rule-panel" aria-label="Mola özeti"><h2>Mola özeti</h2><p>Seçtiğiniz konuya kadar olan özetlerden istediklerinizi işaretleyin. Özetler mola süresince sırayla gösterilir.</p></section>'+
      '<div class="actions"><a class="button" href="#unit/'+last.unitId+'/'+last.id+'">← Konuya dön</a></div>';
  }

`;
  let html=replaceOnce(source,'  function route() {',bridge+'  function route() {','route function');
  html=replaceOnce(html,"const view=['home','unit','bank','reading','vocab','mistakes','plan','source','test']", "const view=['home','unit','bank','reading','vocab','mistakes','plan','source','test','breakreview']",'route whitelist');
  html=replaceOnce(html,"      case 'test':html=testPage();break;", "      case 'test':html=testPage();break;\n      case 'breakreview':html=breakReviewPage();break;",'render route');
  html=replaceOnce(html,'    state.last={unitId:unit.id,sectionId:section.id};','    state.last={unitId:unit.id,sectionId:section.id};\n    breakReviewCutoff=null;','last topic');
  html=replaceOnce(html,'<div class="topic-neighbors">','<div class="actions" style="margin-top:24px"><a class="button" href="#breakreview">☕ Mola sayfasına geç</a></div><div class="topic-neighbors">','topic break link');
  html=replaceOnce(html,"    if(kind==='section'){go(`unit/${input.dataset.unit}/${input.value}`);return;}", "    if(kind==='breakreview-cutoff'){const value=Number(input.value);if(Number.isInteger(value)&&value>=0&&value<BREAK_REVIEW_PAGES.length){breakReviewCutoff=value;render({preserveFocus:true});}return;}\n    if(kind==='section'){go(`unit/${input.dataset.unit}/${input.value}`);return;}",'cutoff change');
  html=replaceOnce(html,/  save\(\);render\(\);\r?\n\}\)\(\);/g,`  window.EnglishBreakReview?.register({pages:BREAK_REVIEW_PAGES,getIndex:breakReviewIndex,getBreakTarget:()=>currentRoute?.view==='breakreview'?document.getElementById('yds-break-review-target'):null});\n  save();render();\n})();`,'registration');
  return html;
}
