import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setImmediate as nextTurn} from 'node:timers/promises';

const source=fs.readFileSync(new URL('../assets/exam-visit.js',import.meta.url),'utf8');
const renderer=fs.readFileSync(new URL('../assets/exam-results.js',import.meta.url),'utf8');
const VIEW='/api/exam-results/view';
const UUID='11111111-1111-4111-8111-111111111111';
const student=()=>({role:'student',token:'private-session-token',student:{id:'test-student',name:'Private Test Name'}});
function deferred(){let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};}
class Element {
  constructor(){this.children=[];this.textContent='';this.hidden=false;this.value='';this.listeners={};this.classList={toggle(){},add(){}};}
  addEventListener(type,handler){this.listeners[type]=handler;}
  append(...children){this.children.push(...children);}
  replaceChildren(...children){this.children=[...children];this.textContent='';}
  setAttribute(){}
}
async function setup({session=student(),lateReady=false,hidden=false,focused=true,post=async()=>({ok:true}),get=async()=>({exams:[]}),fallbackUUID=false,withRenderer=false,failRendering=false}={}){
  let live=session,focus=focused,timerId=0,uuidCalls=0,randomCalls=0;
  const ready=deferred(),calls=[],timers=new Map(),windowListeners=new Map(),documentListeners=new Map();
  const nodes=new Map(['exam-admin-exam','exam-admin-student','exam-admin','exam-root','exam-status'].map(id=>[id,new Element()]));
  if(failRendering)nodes.get('exam-root').append=()=>{throw new Error('Renderer could not append results.');};
  const on=(map,type,handler)=>{if(!map.has(type))map.set(type,[]);map.get(type).push(handler);};
  const access={ready:ready.promise,session:()=>live,request:async(path,options={})=>{calls.push({path,options});return path===VIEW?post(path,options):get(path,options);}};
  const document={hidden,visibilityState:hidden?'hidden':'visible',hasFocus:()=>focus,addEventListener:(type,handler)=>on(documentListeners,type,handler),getElementById:id=>nodes.get(id),createElement:()=>new Element(),querySelectorAll:()=>[]};
  const window={EnglishAccess:access,addEventListener:(type,handler)=>on(windowListeners,type,handler)};
  const crypto={getRandomValues:bytes=>{randomCalls++;for(let i=0;i<bytes.length;i++)bytes[i]=i*13;return bytes;}};
  if(!fallbackUUID)crypto.randomUUID=()=>{uuidCalls++;return UUID;};
  const context={window,document,crypto,Uint8Array,Intl,location:{reload(){}},setTimeout:(handler,ms)=>{const id=++timerId;timers.set(id,{handler,ms});return id;},clearTimeout:id=>timers.delete(id)};
  vm.runInNewContext(source,context,{filename:'exam-visit.js'});
  if(withRenderer)vm.runInNewContext(renderer,context,{filename:'exam-results.js'});
  if(!lateReady){ready.resolve(session);await nextTurn();}
  const fire=async(map,type)=>{for(const handler of map.get(type)||[])handler({type});await nextTurn();};
  return {calls,timers,nodes,visits:window.EnglishExamVisits,ready,document,posts:()=>calls.filter(call=>call.path===VIEW),setSession:value=>{live=value;},setFocus:value=>{focus=value;},setHidden:value=>{document.hidden=value;document.visibilityState=value?'hidden':'visible';},windowEvent:type=>fire(windowListeners,type),documentEvent:type=>fire(documentListeners,type),uuidCalls:()=>uuidCalls,randomCalls:()=>randomCalls,runTimer:async()=>{assert.equal(timers.size,1,'one retry timer');const [id,timer]=timers.entries().next().value;timers.delete(id);timer.handler();await nextTurn();return timer.ms;}};
}

test('a verified student is recorded once only after rendering, visibility and focus',async()=>{
  const d=await setup({lateReady:true,hidden:true,focused:false});
  d.visits.rendered();assert.equal(d.posts().length,0);
  d.ready.resolve(student());await nextTurn();assert.equal(d.posts().length,0);
  d.setHidden(false);await d.documentEvent('visibilitychange');assert.equal(d.posts().length,0);
  d.setFocus(true);await d.windowEvent('focus');assert.equal(d.posts().length,1);
  for(let i=0;i<3;i++){d.visits.rendered();await d.windowEvent('focus');await d.documentEvent('visibilitychange');await d.windowEvent('online');}
  assert.equal(d.posts().length,1);
  assert.equal(d.uuidCalls(),1);
  const {options}=d.posts()[0];
  assert.equal(options.method,'POST');
  assert.equal(JSON.stringify(options.body),JSON.stringify({viewId:UUID}));
  assert.ok(!JSON.stringify(options.body).includes('Private Test Name'));
  assert.ok(!JSON.stringify(options.body).includes('private-session-token'));
  assert.equal(d.timers.size,0);
});

test('fetch readiness alone, admin preview and anonymous users never record a view',async()=>{
  for(const session of [student(),{role:'admin',token:'private-admin-token'},null]){
    const d=await setup({session});
    await d.windowEvent('focus');await d.documentEvent('visibilitychange');await d.windowEvent('online');
    assert.equal(d.posts().length,0,'readiness and browser signals do not imply rendered results');
    if(session?.role!=='student'){d.visits.rendered();await nextTurn();assert.equal(d.posts().length,0);}
  }
});

test('failed requests make at most three automatic attempts with the same UUID and no overlapping sends',async()=>{
  const first=deferred();let attempt=0;
  const d=await setup({post:()=>++attempt===1?first.promise:Promise.reject(new Error('offline'))});
  d.visits.rendered();await d.windowEvent('focus');await d.documentEvent('visibilitychange');
  assert.equal(d.posts().length,1,'focus changes cannot overlap a pending request');
  first.reject(new Error('offline'));await nextTurn();
  assert.equal(await d.runTimer(),1000);
  assert.equal(await d.runTimer(),2000);
  assert.equal(d.posts().length,3);
  assert.equal(d.timers.size,0);
  d.visits.rendered();await d.windowEvent('focus');await d.documentEvent('visibilitychange');
  assert.equal(d.posts().length,3);
  assert.equal(new Set(d.posts().map(call=>call.options.body.viewId)).size,1);
  assert.equal(d.uuidCalls(),1);
});

test('a reconnect retries the existing idempotency key and stops after acknowledgement',async()=>{
  let attempts=0;
  const d=await setup({post:async()=>{if(++attempts===1)throw new Error('lost acknowledgement');return {ok:true};}});
  d.visits.rendered();await nextTurn();assert.equal(d.timers.size,1);
  await d.windowEvent('online');
  assert.equal(d.posts().length,2);
  assert.equal(d.posts()[0].options.body.viewId,d.posts()[1].options.body.viewId);
  assert.equal(d.timers.size,0);
  await d.windowEvent('online');await d.windowEvent('focus');assert.equal(d.posts().length,2);
});

test('a retry waits for a visible focused page and treats an unacknowledged response as failure',async()=>{
  let attempts=0;
  const d=await setup({post:async()=>++attempts===1?{ok:false}:{ok:true}});
  d.visits.rendered();await nextTurn();assert.equal(d.timers.size,1);
  d.setHidden(true);await d.runTimer();assert.equal(d.posts().length,1);
  await d.windowEvent('online');assert.equal(d.posts().length,1);
  d.setFocus(false);d.setHidden(false);await d.documentEvent('visibilitychange');assert.equal(d.posts().length,1);
  d.setFocus(true);await d.windowEvent('focus');assert.equal(d.posts().length,2);
  assert.equal(d.posts()[0].options.body.viewId,d.posts()[1].options.body.viewId);
});

test('logout, expiry and pagehide reject late readiness and late POST completions',async()=>{
  for(const event of ['english:logout','english:session-expired','pagehide']){
    const beforeReady=await setup({lateReady:true});
    beforeReady.visits.rendered();await beforeReady.windowEvent(event);
    beforeReady.ready.resolve(student());await nextTurn();
    await beforeReady.windowEvent('focus');await beforeReady.windowEvent('online');
    assert.equal(beforeReady.posts().length,0,event+' before readiness');
    for(const reject of [false,true]){
      const pending=deferred(),d=await setup({post:()=>pending.promise});
      d.visits.rendered();assert.equal(d.posts().length,1);
      await d.windowEvent(event);
      if(reject)pending.reject(new Error('late failure'));else pending.resolve({ok:true});
      await nextTurn();d.visits.rendered();await d.windowEvent('online');await d.windowEvent('focus');
      assert.equal(d.posts().length,1,event+' ignores a late '+(reject?'failure':'success'));
      assert.equal(d.timers.size,0);
    }
  }
});

test('identity replacement prevents new requests and suppresses retries for the previous student',async()=>{
  for(const replacement of [null,{...student(),token:'replacement-token'},{...student(),student:{id:'another-student',name:'Another Private Name'}}]){
    const d=await setup();d.setSession(replacement);d.visits.rendered();await d.windowEvent('focus');
    assert.equal(d.posts().length,0);
    const pending=deferred(),inflight=await setup({post:()=>pending.promise});
    inflight.visits.rendered();inflight.setSession(replacement);pending.reject(new Error('late failure'));await nextTurn();
    await inflight.windowEvent('online');assert.equal(inflight.posts().length,1);assert.equal(inflight.timers.size,0);
  }
});

test('UUID fallback uses random bytes and produces a version 4 variant without identity data',async()=>{
  const d=await setup({fallbackUUID:true});d.visits.rendered();await nextTurn();
  assert.equal(d.posts().length,1);assert.equal(d.randomCalls(),1);
  assert.match(d.posts()[0].options.body.viewId,/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.deepEqual(Object.keys(d.posts()[0].options.body),['viewId']);
});

test('renderer records an empty results page only after successful rendering and clears stale GET responses',async()=>{
  const success=await setup({withRenderer:true});
  assert.equal(success.calls[0].path,'/api/exam-results');
  assert.equal(success.posts().length,1);
  assert.equal(success.nodes.get('exam-root').children.length,1);
  const background=await setup({withRenderer:true,hidden:true});
  assert.equal(background.calls.length,1,'a completed background GET is not a page view');
  assert.equal(background.nodes.get('exam-root').children.length,1);
  background.setHidden(false);await background.documentEvent('visibilitychange');assert.equal(background.posts().length,1);
  for(const configuration of [{get:async()=>({exams:null})},{get:async()=>{throw new Error('Results unavailable');}},{failRendering:true}]){
    const failed=await setup({...configuration,withRenderer:true});
    assert.equal(failed.posts().length,0,'failed fetching or rendering must not mark a page view');
  }
  for(const event of ['english:logout','english:session-expired','pagehide']){
    const pending=deferred(),d=await setup({withRenderer:true,get:()=>pending.promise});
    assert.equal(d.calls.length,1);await d.windowEvent(event);
    pending.resolve({exams:[]});await nextTurn();
    assert.equal(d.posts().length,0,event+' rejects late private GET');
    assert.equal(d.nodes.get('exam-root').children.length,0);
  }
  const pending=deferred(),changed=await setup({withRenderer:true,get:()=>pending.promise});
  changed.setSession({...student(),student:{id:'different-student'}});
  pending.resolve({exams:[]});await nextTurn();
  assert.equal(changed.posts().length,0);assert.equal(changed.nodes.get('exam-root').children.length,0);
  const lateReady=await setup({withRenderer:true,lateReady:true});
  await lateReady.windowEvent('pagehide');lateReady.ready.resolve(student());await nextTurn();
  assert.equal(lateReady.calls.length,0,'a page left before readiness must not fetch private results');
});
