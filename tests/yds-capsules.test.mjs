import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {loadContent,validateSupplement} from '../scripts/build-yds.mjs';

const content=await loadContent();
const source=await fs.readFile(new URL('../yds-src/app.js',import.meta.url),'utf8');
const application=new vm.Script(source,{filename:'yds-src/app.js'});
const key='hudavendigar-yds-grammar-studio-v1';
const baseQuestions=content.units.flatMap(unit=>[...unit.questions,...unit.reading.questions]);

function fixture(hash='#capsules',initial={},data=content) {
  const nodes=new Map(),events=new Map(),windowEvents=new Map(),timers=new Map();
  const stored=new Map([[key,JSON.stringify(initial)]]);
  let document,timerId=0,writes=0;
  const on=(map,type,callback)=>map.set(type,[...(map.get(type)||[]),callback]);
  const emit=(map,type,event={})=>(map.get(type)||[]).forEach(callback=>callback(event));
  function element(id='',dataset={}) {
    let html='';const classes=new Set();
    return {id,dataset,value:'',textContent:'',disabled:false,inert:false,selectionStart:0,
      classList:{contains:name=>classes.has(name),add:name=>classes.add(name),remove:name=>classes.delete(name),toggle(name,force=!classes.has(name)){force?classes.add(name):classes.delete(name);}},
      setAttribute(){},removeAttribute(){},focus(){document.activeElement=this;},setSelectionRange(start){this.selectionStart=start;},scrollIntoView(){},
      closest(selector){return selector==='[data-action]'&&this.dataset.action?this:null;},
      get innerHTML(){return html;},set innerHTML(value){html=String(value);if(id!=='workspace')return;writes++;for(const [childId] of nodes)if(childId.startsWith('question-')||childId==='capsule-search')nodes.delete(childId);for(const match of html.matchAll(/\bid="([^"]+)"[^>]*>/g)){const child=element(match[1]);child.value=match[0].match(/value="([^"]*)"/)?.[1]||'';nodes.set(child.id,child);}}
    };
  }
  for(const id of ['study-data','workspace','save-indicator','toast','menu-button','font-button','mistake-badge','unit-nav'])nodes.set(id,element(id));
  nodes.get('study-data').textContent=JSON.stringify(data);
  document={body:element('body'),activeElement:null,getElementById:id=>nodes.get(id)||null,querySelector:selector=>/^#[\w-]+$/.test(selector)?nodes.get(selector.slice(1))||null:null,querySelectorAll:()=>[],addEventListener:(type,callback)=>on(events,type,callback)};
  let currentHash=hash;
  const location={get hash(){return currentHash;},set hash(value){currentHash=String(value).startsWith('#')?String(value):'#'+value;}};
  application.runInNewContext({document,location,localStorage:{getItem:k=>stored.get(k)||null,setItem:(k,value)=>stored.set(k,value)},window:{addEventListener:(type,callback)=>on(windowEvents,type,callback),scrollTo(){},print(){}},matchMedia:()=>({matches:false,addEventListener(){}}),setInterval(){},clearInterval(){},setTimeout(callback){const id=++timerId;timers.set(id,callback);return id;},clearTimeout:id=>timers.delete(id)});
  return {
    get html(){return nodes.get('workspace').innerHTML;},get writes(){return writes;},state:()=>JSON.parse(stored.get(key)),node:id=>nodes.get(id),
    navigate(next){location.hash=next;emit(windowEvents,'hashchange');},
    click(action,data={}){const before=location.hash;emit(events,'click',{target:element('',{action,...data})});if(location.hash!==before)emit(windowEvents,'hashchange');},
    change(kind,value){const input=element('',{change:kind});input.value=String(value);input.checked=Boolean(value);const before=location.hash;emit(events,'change',{target:input});if(location.hash!==before)emit(windowEvents,'hashchange');},
    search(value){const input=nodes.get('capsule-search');input.dataset.search='capsule';input.value=value;input.selectionStart=value.length;input.focus();emit(events,'input',{target:input});},
    flush(){for(const [id,callback]of [...timers])if(timers.delete(id))callback();},
    submit(){emit(events,'submit',{target:{id:'test-form'},preventDefault(){}});}
  };
}

test('new source adds 72 linked capsules and 100 explained questions without changing the original curriculum',()=>{
  assert.equal(content.units.length,12);
  assert.equal(content.units.reduce((sum,unit)=>sum+unit.sections.length,0),123);
  assert.equal(baseQuestions.length,230);
  assert.equal(content.summary.questions,230);
  assert.equal(content.summary.totalQuestions,330);
  assert.equal(content.supplement.capsules.length,72);
  assert.equal(content.supplement.questions.length,100);
  assert.equal(validateSupplement(content.supplement,content.units),content.supplement);
  for(const capsule of content.supplement.capsules)assert.ok(content.supplement.questions.some(q=>q.topicId===capsule.id));
});

test('supplement validation rejects broken references, answer explanations and unbalanced keys',()=>{
  for(const [change,expected]of [
    [data=>{data.questions[0].sectionId='u12-s99';},/konu\/ünite/],
    [data=>{data.questions[0].optionExplanations[3]='';},/her seçeneğin/],
    [data=>{data.questions[0].options[1]=data.questions[0].options[0];},/beş farklı/],
    [data=>{data.questions.forEach(q=>q.answer=0);},/dengeli/],
    [data=>{data.capsules[1].id=data.capsules[0].id;},/tekrarlanan/],
  ]){const copy=structuredClone(content.supplement);change(copy);assert.throws(()=>validateSupplement(copy,content.units),expected);}
});

test('capsules paginate, filter, debounce search and keep details initially folded',()=>{
  const app=fixture();
  assert.equal((app.html.match(/class="capsule-card"/g)||[]).length,12);
  assert.ok(!/class="capsule-details" open/.test(app.html));
  assert.ok(app.html.includes('72 / 72 kart · Sayfa 1/6'));
  app.click('capsule-next');assert.ok(app.html.includes('id="capsule-hb13"'));
  app.change('capsule-unit','u02');assert.equal((app.html.match(/class="capsule-card"/g)||[]).length,6);
  const writes=app.writes;app.search('zzzznotfoundzzzz');assert.equal(app.writes,writes);
  app.flush();assert.ok(app.html.includes('Bu aramada kart bulunamadı.'));assert.equal(app.node('capsule-search').value,'zzzznotfoundzzzz');
  app.navigate('#capsules/hb01');assert.equal((app.html.match(/class="capsule-card"/g)||[]).length,1);assert.match(app.html,/class="capsule-details" open/);
  app.click('reset-capsules');assert.ok(app.html.includes('72 / 72 kart · Sayfa 1/6'));
});

test('new questions grade through the existing wrong book and reveal five reasons only after checking',()=>{
  const old=baseQuestions[0];const q=content.supplement.questions[0];
  const app=fixture('#home',{answers:{[old.id]:{choice:old.answer,checked:true,attempts:2}},read:{'u01-s01':true}});
  assert.ok(app.html.includes('Hap bilgileri aç'));
  app.click('new-bank');assert.match(app.html,/100 soru · Sayfa 1\/13/);assert.ok(!app.html.includes('id="question-'+old.id+'"'));
  assert.ok(!app.html.includes(q.optionExplanations[0]));
  app.click('choose',{question:q.id,index:String((q.answer+1)%5),exam:'false'});app.click('grade',{question:q.id});
  assert.equal(app.state().wrong[q.id],true);assert.equal(app.state().answers[old.id].attempts,2);assert.equal(app.state().read['u01-s01'],true);
  assert.ok(app.html.includes('Beş seçeneği karşılaştır'));assert.ok(app.html.includes(q.optionExplanations[q.answer].replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;')));
  app.navigate('#mistakes');assert.ok(app.html.includes('id="question-'+q.id+'"'));
  app.click('retry',{question:q.id});assert.ok(!app.html.includes('Beş seçeneği karşılaştır'));assert.equal(app.state().answers[q.id].attempts,1);
});

test('capsule question links filter the matching topic and new-source tests preserve the grading flow',()=>{
  const capsule=content.supplement.capsules[0];const app=fixture();
  app.click('capsule-practice',{topic:capsule.id});assert.ok(app.html.includes('Hap bilgi:'));
  const expected=content.supplement.questions.filter(q=>q.topicId===capsule.id);
  for(const q of expected.slice(0,8))assert.ok(app.html.includes('id="question-'+q.id+'"'));
  app.click('new-bank');app.click('test-from-bank');app.change('test-reading',true);app.change('test-count',10);app.change('test-minutes',0);app.submit();
  assert.equal(app.state().exam.ids.length,10);assert.ok(app.state().exam.ids.every(id=>/^hq\d{3}$/.test(id)));assert.ok(!app.html.includes('Beş seçeneği karşılaştır'));
  app.click('test-finish');assert.equal(app.state().history.length,1);assert.ok(app.html.includes('Beş seçeneği karşılaştır'));assert.equal(Object.keys(app.state().wrong).length,10);
});

test('opening another unit question bank clears a stale capsule topic filter',()=>{
  const app=fixture();app.click('capsule-practice',{topic:'hb01'});assert.ok(app.html.includes('Hap bilgi:'));
  app.navigate('#bank/u02');assert.ok(!app.html.includes('Hap bilgi:'));
  assert.ok(!app.html.includes('Bu filtrede soru bulunamadı.'));
  app.change('bank-source','original');assert.ok(app.html.includes('id="question-u02-q01"'));
});

test('new-question formats filter the bank, carry into tests and reset when the source changes',()=>{
  const format=content.supplement.questions.find(q=>q.type!=='reading').format;
  const matching=content.supplement.questions.filter(q=>q.format===format);
  const app=fixture();app.click('new-bank');assert.ok(app.html.includes('data-change="bank-format"'));
  app.change('bank-format',format);assert.ok(app.html.includes(`${matching.length} soru · Sayfa`));
  app.change('bank-source','original');assert.ok(!app.html.includes('data-change="bank-format"'));
  app.change('bank-source','new');assert.match(app.html,/100 soru · Sayfa 1\/13/);
  app.change('bank-format',format);app.click('test-from-bank');assert.ok(app.html.includes('id="test-format"'));
  app.submit();const questions=new Map(content.supplement.questions.map(q=>[q.id,q]));
  assert.ok(app.state().exam.ids.length>0);assert.ok(app.state().exam.ids.every(id=>questions.get(id)?.format===format));
});

test('new reading questions use their own full prompt instead of an unrelated unit passage',()=>{
  const q=content.supplement.questions.find(item=>item.type==='reading');assert.ok(q);
  const app=fixture('#test',{exam:{ids:[q.id],choices:{},index:0,started:Date.now(),minutes:0,submitted:false}});
  assert.ok(app.html.includes('id="question-'+q.id+'"'));
  assert.ok(!app.html.includes('class="passage"'));assert.match(app.html,/question-context/);
  assert.ok(!app.html.includes('Beş seçeneği karşılaştır'));
});

test('an expired persisted new-question test grades once and remains available after reload',()=>{
  const q=content.supplement.questions[0];
  const app=fixture('#test',{exam:{ids:[q.id],choices:{[q.id]:q.answer},index:0,started:Date.now()-120000,minutes:1,submitted:false}});
  assert.equal(app.state().history.length,1);assert.equal(app.state().exam.expired,true);
  assert.equal(app.state().answers[q.id].checked,true);assert.ok(app.html.includes('Beş seçeneği karşılaştır'));
  const restored=fixture('#test',app.state());assert.equal(restored.state().history.length,1);assert.equal(restored.state().answers[q.id].attempts,1);
});

test('empty new-question pools explain the next step and cannot start an empty exam',()=>{
  const data=structuredClone(content);data.supplement.questions=data.supplement.questions.filter(q=>q.type==='reading');
  const app=fixture('#test',{},data);app.change('test-source','new');
  assert.ok(app.html.includes('Bu seçimde soru yok.'));assert.match(app.html,/type="submit" disabled/);
  app.submit();assert.equal(app.state().exam,null);
  app.change('test-reading',true);assert.ok(!app.html.includes('Bu seçimde soru yok.'));app.submit();assert.ok(app.state().exam.ids.length>0);
});

test('capsule and question text is escaped, including detailed feedback',()=>{
  const data=structuredClone(content),payload='<img src=x onerror="alert(1)">';
  data.supplement.capsules[0].title=payload;data.supplement.questions[0].prompt=payload;data.supplement.questions[0].explanation=payload;
  const app=fixture('#capsules',{},data);assert.ok(!app.html.includes(payload));assert.ok(app.html.includes('&lt;img'));
  app.click('new-bank');assert.ok(!app.html.includes(payload));assert.ok(app.html.includes('&lt;img'));
  const q=data.supplement.questions[0];app.click('choose',{question:q.id,index:String(q.answer),exam:'false'});app.click('grade',{question:q.id});
  assert.ok(!app.html.includes(payload));assert.ok(app.html.includes('&lt;img'));
});
