import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const tracker=await readFile(new URL('../assets/activity-tracker.js',import.meta.url),'utf8');
const bridge=await readFile(new URL('../assets/assessment-bridge.js',import.meta.url),'utf8');
class Node {
  constructor({top=10,height=100,attrs={}}={}) {this.attrs=attrs;this.top=top;this.height=height;this.tagName='BUTTON';this.textContent='';this.isConnected=true;this.hidden=false;this.classList={contains:()=>false};}
  getBoundingClientRect(){return {top:this.top,bottom:this.top+this.height,left:10,right:510,width:500,height:this.height};}
  getAttribute(name){return this.attrs[name]??null;}
  setAttribute(name,value){this.attrs[name]=value;}
  removeAttribute(name){delete this.attrs[name];}
  hasAttribute(name){return Object.hasOwn(this.attrs,name);}
  closest(selector){if(selector.includes('aria-hidden'))return null;if(selector.includes('data-learning-question'))return this.hasAttribute('data-learning-question')||this.hasAttribute('data-learning-questions')?this:null;return this;}
}
async function harness({id='student-1',storage=new Map(),offline=true,preOpen=false}={}) {
  let now=0,next=0,uuid=0,session={student:{id},role:'student'};
  const epoch=Date.now(),timers=new Map(),docListeners=new Map(),winListeners=new Map(),requests=[];
  const on=(map,type,handler)=>map.set(type,[...(map.get(type)||[]),handler]);
  const emit=(map,event)=>{for(const fn of map.get(event.type)||[])fn(event);};
  const document={title:'Lesson A2',visibilityState:'visible',focused:true,hasFocus(){return this.focused;},addEventListener:(type,fn)=>on(docListeners,type,fn),removeEventListener:(type,fn)=>docListeners.set(type,(docListeners.get(type)||[]).filter(x=>x!==fn)),getElementById:()=>null,querySelector:()=>null,querySelectorAll:()=>[],documentElement:{clientHeight:720,clientWidth:1280}};
  const window={innerHeight:720,innerWidth:1280,addEventListener:(type,fn)=>on(winListeners,type,fn),removeEventListener:(type,fn)=>winListeners.set(type,(winListeners.get(type)||[]).filter(x=>x!==fn)),dispatchEvent:event=>{emit(winListeners,event);return true;},EnglishAccess:{ready:Promise.resolve(session),session:()=>session,request:async(url,options)=>{requests.push({url,body:typeof options.body==='string'?JSON.parse(options.body):options.body});return{ok:true};}},EnglishLessonProgress:{snapshot:()=>({pageKind:'lesson',pageIndex:0,totalPages:8,questionCount:2,completed:false})}};
  class ClockDate extends Date {constructor(...args){super(...(args.length?args:[epoch+now]));}static now(){return epoch+now;}}
  const context=vm.createContext({window,document,location:{pathname:'/ingilizce-dersler/lessons/a2/day-04.html',hash:''},performance:{now:()=>now},Date:ClockDate,Element:Node,CustomEvent:class{constructor(type,{detail}){this.type=type;this.detail=detail;}},navigator:{onLine:!offline},crypto:{randomUUID:()=>`aaaaaaaa-aaaa-4aaa-8aaa-${String(++uuid).padStart(12,'0')}`},localStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value)},TextEncoder,setInterval:(fn,ms)=>{const key=++next;timers.set(key,{fn,ms});return key;},clearInterval:key=>timers.delete(key)});
  vm.runInContext(bridge,context);
  if(preOpen)window.EnglishAssessment.observe(new Node(),'pre','I ___ here.','fill-blank',{id:'be',title:'Am / is / are'});
  vm.runInContext(tracker,context);
  const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};await settle();
  return {context,window,document,requests,storage,api:window.EnglishAssessment,settle,
    events:()=>{const all=[...requests.filter(x=>x.url==='/api/events').flatMap(x=>x.body.events),...JSON.parse(storage.get(`en-access-events:${id}`)||'[]')];return [...new Map(all.map(x=>[x.eventId,x])).values()];},
    advance:async ms=>{for(let elapsed=0;elapsed<ms;elapsed+=500){now+=Math.min(500,ms-elapsed);for(const [key,timer]of [...timers])if(now%timer.ms===0&&timers.has(key))timer.fn();await settle();}},
    jump:async ms=>{now+=ms;for(const timer of timers.values())timer.fn();await settle();},
    emit:async(type,event={},target='window')=>{emit(target==='window'?winListeners:docListeners,{type,...event});await settle();},
    setIdentity:value=>{session=value;},
  };
}
const results=app=>app.events().filter(event=>event.type==='question_result');
const check=(app,id='q1',answer='am',right=true)=>app.api.result(id,'I ___ here.',answer,'am',right);

test('question timing counts wall time separately from observed active time',async()=>{
  const app=await harness();app.api.open('q1','I ___ here.','fill-blank',{id:'be',title:'Am / is / are'});
  await app.advance(10000);app.document.visibilityState='hidden';await app.emit('visibilitychange',{},'document');
  await app.advance(20000);app.document.visibilityState='visible';await app.emit('visibilitychange',{},'document');
  await app.advance(10000);check(app);
  const value=results(app).at(-1).learning;
  assert.equal(value.timingScope,'question');assert.equal(value.wallSeconds,40);assert.equal(value.activeSeconds,20);
  assert.equal(value.topicId,'be');assert.equal(value.helpUsed,false);assert.equal(value.answerRevealed,false);
});

test('below viewport and hidden questions are not opened; visible question metadata is buffered before tracker readiness',async()=>{
  const app=await harness({preOpen:true});
  const opened=app.events().find(x=>x.type==='question_open'&&x.learning.questionId==='pre');
  assert.equal(opened.learning.prompt,'I ___ here.');
  assert.ok(!('selectedAnswer' in opened.learning));
  const below=new Node({top:900});app.api.observe(below,'below','Static prompt');
  const hidden=new Node();hidden.hidden=true;app.api.observe(hidden,'hidden','Static prompt');
  assert.ok(!app.events().some(x=>x.type==='question_open'&&['below','hidden'].includes(x.learning.questionId)));
  below.top=20;await app.emit('scroll',{},'document');
  assert.equal(app.events().filter(x=>x.type==='question_open'&&x.learning.questionId==='below').length,1);
  await app.emit('scroll',{},'document');assert.equal(app.events().filter(x=>x.type==='question_open'&&x.learning.questionId==='below').length,1);
});

test('unobserved questions use a clearly labeled screen timing fallback and unknown aid state',async()=>{
  const app=await harness();await app.advance(5000);check(app);
  const value=results(app).at(-1).learning;assert.equal(value.prompt,'I ___ here.');assert.equal(value.timingScope,'screen');assert.equal(value.wallSeconds,5);assert.equal(value.helpUsed,null);assert.equal(value.hintUsed,null);assert.equal(value.answerRevealed,null);
});

test('help before a first attempt and after an attempt are distinguished; attempts retain aid history',async()=>{
  const app=await harness();app.api.open('q1','I ___ here.');app.api.help('q1','hint');await app.settle();
  check(app,'q1','is',false);await app.advance(3000);app.api.help('q1','answer');await app.settle();check(app,'q1','am',true);
  const help=app.events().filter(x=>x.type==='help_used');assert.deepEqual(help.map(x=>x.learning.attemptedBeforeHelp),[false,true]);
  const first=results(app)[0].learning,last=results(app).at(-1).learning;
  assert.equal(first.hintUsed,true);assert.equal(first.answerRevealed,false);assert.equal(last.answerRevealed,true);assert.equal(last.wallSeconds,3);
});

test('assistance history survives refresh and is isolated per student and lesson',async()=>{
  const first=await harness();first.api.open('q1','Prompt');first.api.help('q1','answer');check(first,'q1','is',false);
  const same=await harness({storage:first.storage});same.api.open('q1','Prompt');check(same);
  assert.equal(results(same).at(-1).learning.answerRevealed,true);
  const other=await harness({id:'student-2',storage:first.storage});other.api.open('q1','Prompt');check(other);
  assert.equal(results(other).at(-1).learning.answerRevealed,false);
  assert.ok(!JSON.stringify(other.events()).includes('PRIVATE NOTE'));
});

test('page summaries use non-overlapping slices, retain original page metadata and never earn duplicate heartbeat credit',async()=>{
  const app=await harness();await app.advance(30000);
  app.window.EnglishLessonProgress.snapshot=()=>({pageKind:'break',pageIndex:-1,totalPages:8,questionCount:null,completed:false});
  app.context.location.hash='#A2';
  // A real screen context changes through a fixed, observed heading/selector, not arbitrary hash values.
  const select={id:'screen-select',value:'1',options:[{value:'1',textContent:'Mola'}]};
  app.document.getElementById=id=>id==='screen-select'?select:null;await app.advance(500);
  await app.advance(30000);
  const summaries=app.events().filter(x=>x.type==='page_summary');
  assert.equal(summaries[0].learning.pageKind,'lesson');assert.equal(summaries[0].learning.pageIndex,0);
  assert.equal(summaries[1].learning.pageKind,'lesson');
  assert.notEqual(summaries[0].learning.visitId,summaries.at(-1).learning.visitId);
  assert.equal(summaries.at(-1).learning.pageKind,'break');
  assert.ok(summaries.every(x=>x.activeSeconds===0&&x.learning.activeSeconds<=x.learning.viewSeconds));
});

test('progress requires an explicit denominator and assesses questions rather than treating views as completion',async()=>{
  const app=await harness();app.api.open('q1','Question');app.api.open('q2','Question 2');
  check(app,'q1');let progress=app.events().filter(x=>x.type==='lesson_progress').at(-1).learning;
  assert.equal(progress.completed,false);assert.equal(progress.answeredQuestionCount,1);assert.equal(progress.questionCount,2);
  check(app,'q2');progress=app.events().filter(x=>x.type==='lesson_progress').at(-1).learning;assert.equal(progress.completed,true);
  const unknown=await harness();delete unknown.window.EnglishLessonProgress;unknown.document.getElementById=()=>null;
  // Start a fresh unknown-count view.
  unknown.document.querySelector=selector=>selector.includes('.screen-head')?{textContent:'Different screen'}:null;await unknown.advance(500);check(unknown);
  progress=unknown.events().filter(x=>x.type==='lesson_progress').at(-1).learning;assert.equal(progress.questionCount,null);assert.equal(progress.completed,false);assert.equal(progress.totalPages,0);
});

test('dictionary and break custom events carry only validated canonical metadata',async()=>{
  const app=await harness();
  await app.emit('english:learning-event',{detail:{type:'dictionary_lookup',learning:{kind:'dictionary',term:'nervous',mode:'selection',outcome:'found',source:'local',notes:'PRIVATE NOTE',input:'PRIVATE INPUT'}}});
  const lookup=app.events().find(x=>x.type==='dictionary_lookup');assert.deepEqual(Object.keys(lookup.learning).sort(),['kind','term','mode','outcome','source'].sort());
  await app.emit('english:learning-event',{detail:{type:'dictionary_lookup',learning:{kind:'dictionary',term:'invalid',mode:'raw',outcome:'found',source:'local'}}});
  assert.equal(app.events().filter(x=>x.type==='dictionary_lookup').length,1);
  const learning={kind:'break',breakId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',durationMinutes:10,intervalSeconds:15,selectedPages:[{id:'s1',title:'First page',notes:'PRIVATE NOTE'}],selectedCount:1,elapsedSeconds:0,pausedSeconds:0,endReason:null};
  await app.emit('english:learning-event',{detail:{type:'break_start',learning}});
  assert.equal(app.events().find(x=>x.type==='break_start').learning.selectedPages[0].title,'First page');assert.ok(!JSON.stringify(app.events()).includes('PRIVATE'));
});

test('offline replay preserves canonical learning fields and discards corrupt learning objects',async()=>{
  const first=await harness();first.api.open('q1','I ___ here.');check(first);
  const queue=JSON.parse(first.storage.get('en-access-events:student-1'));const answer=queue.find(x=>x.type==='question_result');answer.learning.secret='PRIVATE';
  const broken={...answer,eventId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',learning:{...answer.learning,activeSeconds:999}};
  first.storage.set('en-access-events:student-1',JSON.stringify([answer,broken]));
  const replay=await harness({storage:first.storage,offline:false});await replay.settle();
  const recovered=results(replay);assert.equal(recovered.length,1);assert.equal(recovered[0].learning.prompt,'I ___ here.');assert.equal(recovered[0].learning.timingScope,'question');assert.ok(!JSON.stringify(recovered).includes('PRIVATE'));
});

test('one element may identify several graded gaps for scoped help without touching unrelated questions',async()=>{
  const app=await harness(),node=new Node();app.api.observe(node,'q1','First blank');app.api.observe(node,'q2','Second blank');app.api.open('q3','Other question');
  node.attrs['data-reveal']='';await app.emit('click',{target:node},'document');check(app,'q1');check(app,'q2');check(app,'q3');
  const byId=new Map(results(app).map(x=>[x.learning.questionId,x.learning]));assert.equal(byId.get('q1').answerRevealed,true);assert.equal(byId.get('q2').answerRevealed,true);assert.equal(byId.get('q3').answerRevealed,false);
});

test('a reveal that grades a previously selected answer does not retroactively assist that attempt',async()=>{
  const app=await harness(),node=new Node({attrs:{'data-learning-question':'q1','data-reveal':''}});app.api.open('q1','Prompt');
  const click=app.emit('click',{target:node},'document');check(app,'q1','is',false);await click;
  assert.equal(results(app)[0].learning.answerRevealed,false);
  const help=app.events().filter(x=>x.type==='help_used').at(-1).learning;assert.equal(help.attemptedBeforeHelp,true);
  check(app,'q1','am',true);assert.equal(results(app).at(-1).learning.answerRevealed,true);
});

test('frozen tabs cannot inflate question active time or page analytic credit',async()=>{
  const app=await harness();app.api.open('q1','Prompt');await app.advance(2000);await app.jump(360000);check(app);
  const question=results(app).at(-1).learning;assert.equal(question.wallSeconds,362);assert.equal(question.activeSeconds,2);
  const page=app.events().filter(x=>x.type==='page_summary').at(-1).learning;assert.equal(page.activeSeconds,2);
});

test('identity replacement blocks further result, help, dictionary and page collection',async()=>{
  const app=await harness();app.api.open('q1','Prompt');app.setIdentity({student:{id:'student-2'},role:'student'});
  check(app);await app.emit('english:learning-event',{detail:{type:'dictionary_lookup',learning:{kind:'dictionary',term:'hello',mode:'manual',outcome:'found',source:'local'}}});
  await app.advance(30000);assert.equal(results(app).length,0);assert.equal(app.events().filter(x=>x.type==='dictionary_lookup').length,0);assert.equal(app.storage.has('en-access-events:student-2'),false);
});
