import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';

const script=await fs.readFile(new URL('../assets/teacher-guides.js',import.meta.url),'utf8');
const endpoint='/api/admin/teacher-guides';
const admin={role:'admin',expiresAt:'2099-01-01T00:00:00Z'};
const student={role:'student',student:{id:'synthetic-1'}};
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const catalog={lessons:[{id:'a1/day-01',title:'Birinci ders'},{id:'b1/day-02',title:'İkinci ders'}]};
const guide=(id='a1/day-01',text='SYNTHETIC PRIVATE NOTE')=>({id,title:'Synthetic teacher guide',sections:[{id:'notes',title:'Private section',content:{teacher:text}}]});

class Element {
  constructor(tag,owner) {this.tagName=tag.toUpperCase();this.owner=owner;this.children=[];this.listeners=new Map();this.hidden=false;this.disabled=false;this.value='';this.ownText='';this.classes=new Set();this.classList={toggle:(name,force)=>{if(force===undefined? !this.classes.has(name):force)this.classes.add(name);else this.classes.delete(name);},contains:name=>this.classes.has(name)};}
  set textContent(value) {this.ownText=String(value);this.children=[];}
  get textContent() {return this.ownText+this.children.map(child=>child.textContent).join('');}
  set innerHTML(_) {throw new Error('HTML parsing must never be used for private guide data');}
  append(...children) {for(const child of children){if(child.tagName==='#FRAGMENT')this.append(...child.children);else{child.parentElement=this;this.children.push(child);}}}
  replaceChildren(...children) {this.ownText='';this.children=[];this.append(...children);}
  addEventListener(type,callback) {this.listeners.set(type,[...(this.listeners.get(type)||[]),callback]);}
  emit(type,event={}) {for(const callback of this.listeners.get(type)||[])callback({target:this,type,...event});}
  click() {this.emit('click');}
  remove() {if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(child=>child!==this);}
}
const allNodes=node=>[node,...node.children.flatMap(allNodes)];

async function harness({cachedSession=null,search=''}={}) {
  const ready=deferred(),requests=[],listeners=new Map(),timers=[],blobs=new Map(),revoked=[];
  let session=cachedSession,now=Date.now(),nextURL=0;
  const ids=new Map();
  const document={createElement:tag=>new Element(tag,document),createDocumentFragment:()=>new Element('#fragment',document),getElementById:id=>ids.get(id)};
  document.body=document.createElement('body');
  for(const id of ['guide-status','guide-content','guide-open-lesson','guide-lesson','admin-dashboard','admin-signin','guide-retry']){const node=document.createElement(id==='guide-lesson'?'select':'div');node.id=id;ids.set(id,node);document.body.append(node);}
  ids.get('admin-dashboard').hidden=true;ids.get('guide-open-lesson').hidden=true;
  const location={href:'https://school.example/teacher-guide.html'+search,search};
  const window={addEventListener:(type,fn)=>listeners.set(type,[...(listeners.get(type)||[]),fn]),EnglishAccess:{ready:ready.promise,session:()=>session,request:url=>{const response=deferred();requests.push({url,...response});return response.promise;}}};
  class MockURL extends URL {
    static createObjectURL(blob) {const value='blob:synthetic-'+ ++nextURL;blobs.set(value,blob);return value;}
    static revokeObjectURL(value) {blobs.delete(value);revoked.push(value);}
  }
  class ClockDate extends Date {static now(){return now;}}
  const context=vm.createContext({window,document,location,URL:MockURL,URLSearchParams,Blob,Uint8Array,atob,Date:ClockDate,history:{replaceState(_,__,url){location.href=String(url);location.search=new URL(location.href).search;}},setTimeout:(callback,ms)=>{timers.push({callback,ms});return timers.length;}});
  vm.runInContext(script,context);
  const settle=async()=>{for(let turn=0;turn<15;turn++)await Promise.resolve();};
  await settle();
  return {window,document,requests,context,blobs,revoked,timers,settle,node:id=>ids.get(id),
    privateRequests:()=>requests.filter(request=>request.url.startsWith(endpoint)),
    setSession:value=>{session=value;},
    ready:async(value,{setSession=true}={})=>{if(setSession)session=value;ready.resolve(value);await settle();},
    resolve:async(index,data)=>{assert.ok(requests[index],`Missing request ${index}`);requests[index].resolve(data);await settle();},
    reject:async(index,message)=>{assert.ok(requests[index],`Missing request ${index}`);requests[index].reject(new Error(message));await settle();},
    fire:async(type,event={})=>{for(const callback of listeners.get(type)||[])callback({type,...event});await settle();},
    click:async id=>{ids.get(id).emit('click');await settle();},
    select:async id=>{ids.get('guide-lesson').value=id;ids.get('guide-lesson').emit('change');await settle();},
    advance:ms=>{now+=ms;}
  };
}
async function rendered(options={}) {
  const app=await harness(options);await app.ready(admin);await app.resolve(0,catalog);await app.resolve(1,guide());return app;
}
function assertCleared(app) {
  assert.equal(app.node('guide-content').textContent,'');
  assert.equal(app.node('guide-lesson').children.length,0);
  assert.equal(app.node('guide-lesson').disabled,true);
  assert.equal(app.node('guide-open-lesson').hidden,true);
  assert.equal(app.node('admin-dashboard').hidden,true);
}

test('anonymous and student clients never call a guide endpoint before or after access readiness',async()=>{
  for(const identity of [null,student]) {
    const app=await harness({cachedSession:identity});
    await app.click('guide-retry');await app.fire('focus');await app.fire('pageshow',{persisted:true});
    assert.equal(app.privateRequests().length,0);
    await app.ready(identity);await app.click('guide-retry');await app.select('a1/day-01');
    assert.equal(app.privateRequests().length,0);assertCleared(app);
  }
});

test('a cached admin identity cannot bypass unresolved verified readiness through retry',async()=>{
  const app=await harness({cachedSession:admin});await app.click('guide-retry');
  assert.equal(app.privateRequests().length,0,'private requests must wait for verified access.ready');
  await app.ready(admin);assert.equal(app.privateRequests().length,1);
});

test('verified administrator fetches only the private catalog and selected guide',async()=>{
  const app=await harness({search:'?lesson=b1%2Fday-02'});assert.equal(app.requests.length,0);
  await app.ready(admin);assert.equal(app.requests[0].url,endpoint);
  await app.resolve(0,catalog);assert.equal(app.requests[1].url,endpoint+'/b1/day-02');
  await app.resolve(1,guide('b1/day-02'));
  assert.match(app.node('guide-content').textContent,/SYNTHETIC PRIVATE NOTE/);
  assert.equal(app.node('guide-open-lesson').href,'lessons/b1/day-02.html');
  assert.equal(app.node('guide-open-lesson').hidden,false);assert.equal(app.requests.length,2);
});

test('malicious titles, section values and keys remain inert text without HTML parsing',async()=>{
  const app=await harness();await app.ready(admin);await app.resolve(0,catalog);
  const malicious=guide();malicious.title='<img src=x onerror="window.pwned=true">';
  malicious.sections=[{id:'safe',title:'<script>window.pwned=true</script>',content:{'<svg onload="window.pwned=true">':'<img src=x onerror="window.pwned=true">','teacher':'&lt;iframe src="https://evil.example"&gt;','nested':[{content:'<script>window.pwned=true</script>'}]}}];
  malicious.attachments=[{name:'<script>bad</script>.html',mime:'text/html',base64:'PHNjcmlwdD5iYWQ8L3NjcmlwdD4='}];
  await app.resolve(1,malicious);
  const content=app.node('guide-content');assert.match(content.textContent,/<img src=x onerror=/);assert.match(content.textContent,/<script>/);
  assert.ok(!allNodes(content).some(node=>['SCRIPT','IMG','IFRAME','SVG'].includes(node.tagName)));
  assert.equal(app.context.window.pwned,undefined);assert.equal(app.requests.length,2);
  allNodes(content).find(node=>node.tagName==='BUTTON').click();await app.settle();
  assert.equal(app.blobs.size,0,'HTML attachments cannot be opened as an executable page');
});

test('logout, expiry and pagehide erase rendered private DOM and revoke attachment object URLs',async()=>{
  for(const event of ['english:logout','english:session-expired','pagehide']) {
    const app=await harness();await app.ready(admin);await app.resolve(0,catalog);
    await app.resolve(1,{...guide(),attachments:[{name:'Synthetic.pdf',mime:'application/pdf',base64:'c3ludGhldGlj'}]});
    const download=allNodes(app.node('guide-content')).find(node=>node.tagName==='BUTTON');download.click();await app.settle();assert.equal(app.blobs.size,1);
    if(event!=='pagehide')app.setSession(null);await app.fire(event);
    assertCleared(app);assert.equal(app.blobs.size,0);assert.equal(app.revoked.length,1);
    download.click();await app.settle();assert.equal(app.blobs.size,0,'a retained detached download button cannot reopen private data after lock');
  }
});

test('in-flight private responses cannot restore DOM after logout, expiry or pagehide',async()=>{
  for(const event of ['english:logout','english:session-expired','pagehide']) {
    const app=await harness();await app.ready(admin);await app.resolve(0,catalog);
    if(event!=='pagehide')app.setSession(null);await app.fire(event);await app.resolve(1,guide());
    assertCleared(app);assert.ok(!app.document.body.textContent.includes('SYNTHETIC PRIVATE NOTE'));
  }
});

test('older lesson success or error cannot overwrite a newer selected guide',async()=>{
  for(const outcome of ['success','error']) {
    const app=await harness();await app.ready(admin);await app.resolve(0,catalog);await app.select('b1/day-02');
    assert.equal(app.requests[2].url,endpoint+'/b1/day-02');await app.resolve(2,guide('b1/day-02','NEW PRIVATE GUIDE'));
    if(outcome==='success')await app.resolve(1,guide('a1/day-01','OLD PRIVATE GUIDE'));else await app.reject(1,'OLD ERROR');
    assert.match(app.node('guide-content').textContent,/NEW PRIVATE GUIDE/);assert.ok(!app.document.body.textContent.includes('OLD PRIVATE GUIDE'));assert.ok(!app.node('guide-status').textContent.includes('OLD ERROR'));
    assert.equal(app.node('guide-open-lesson').href,'lessons/b1/day-02.html');
  }
});

test('catalog and guide failures allow retry without retaining earlier private data',async()=>{
  const app=await harness();await app.ready(admin);await app.reject(0,'Synthetic catalog error');
  assert.match(app.node('guide-status').textContent,/Synthetic catalog error/);assert.equal(app.node('guide-content').textContent,'');
  await app.click('guide-retry');assert.equal(app.requests[1].url,endpoint);await app.resolve(1,catalog);await app.reject(2,'Synthetic guide error');
  assert.match(app.node('guide-status').textContent,/Synthetic guide error/);assert.equal(app.node('guide-content').textContent,'');
  await app.click('guide-retry');await app.resolve(3,catalog);await app.resolve(4,guide());
  assert.match(app.node('guide-content').textContent,/SYNTHETIC PRIVATE NOTE/);assert.equal(app.node('guide-status').textContent,'');
});

test('failed focus verification clears private content and late guide responses remain stale',async()=>{
  const app=await rendered();await app.select('b1/day-02');await app.fire('focus');assert.equal(app.requests[3].url,'/api/auth/me');
  await app.reject(3,'Synthetic expired session');await app.resolve(2,guide('b1/day-02','LATE PRIVATE GUIDE'));
  assertCleared(app);assert.ok(!app.document.body.textContent.includes('LATE PRIVATE GUIDE'));
});

test('bfcache restore starts a fresh load even while the invalidated old catalog request is pending',async()=>{
  const app=await harness();await app.ready(admin);assert.equal(app.requests[0].url,endpoint);
  await app.fire('pagehide');assertCleared(app);await app.fire('pageshow',{persisted:true});
  assert.equal(app.requests[1].url,'/api/auth/me');await app.resolve(1,{role:'admin'});
  assert.equal(app.requests[2]?.url,endpoint,'fresh verified restoration must not be suppressed by old load busy state');
  await app.resolve(0,{lessons:[{id:'a1/day-01',title:'STALE CATALOG'}]});
  await app.click('guide-retry');assert.equal(app.requests.length,3,'an old finally must not release the fresh load lock');
  await app.resolve(2,catalog);await app.resolve(3,guide('a1/day-01','RESTORED PRIVATE GUIDE'));
  assert.match(app.node('guide-content').textContent,/RESTORED PRIVATE GUIDE/);assert.ok(!app.document.body.textContent.includes('STALE CATALOG'));
});

test('ready resolution from a page hidden before initial verification cannot fetch or restore private content',async()=>{
  const app=await harness({cachedSession:admin});await app.fire('pagehide');await app.ready(admin);
  assert.equal(app.privateRequests().length,0,'late initial readiness must not reactivate a page after pagehide');assertCleared(app);
  await app.fire('pageshow',{persisted:true});assert.equal(app.requests[0].url,'/api/auth/me');
  await app.resolve(0,{role:'admin'});await app.resolve(1,catalog);await app.resolve(2,guide());
  assert.match(app.node('guide-content').textContent,/SYNTHETIC PRIVATE NOTE/);
});

test('verification begun before pagehide cannot unlock or fetch private data after that pagehide',async()=>{
  const app=await rendered();await app.fire('focus');assert.equal(app.requests[2].url,'/api/auth/me');
  await app.fire('pagehide');await app.resolve(2,{role:'admin'});
  assert.equal(app.privateRequests().length,2,'stale auth/me resolution must not restart a hidden page');assertCleared(app);
  await app.fire('pageshow',{persisted:true});assert.equal(app.requests[3].url,'/api/auth/me');
  await app.resolve(3,{role:'admin'});await app.resolve(4,catalog);await app.resolve(5,guide());
  assert.match(app.node('guide-content').textContent,/SYNTHETIC PRIVATE NOTE/);
});

test('old verification success or failure cannot relock or replace a newly restored verified guide',async()=>{
  for(const outcome of ['success','failure']) {
    const app=await rendered();await app.fire('focus');assert.equal(app.requests[2].url,'/api/auth/me');
    await app.fire('pagehide');await app.fire('pageshow',{persisted:true});
    await app.resolve(3,{role:'admin'});await app.resolve(4,catalog);await app.resolve(5,guide('a1/day-01','FRESH RESTORED NOTE'));
    if(outcome==='success')await app.resolve(2,{role:'admin'});else await app.reject(2,'STALE VERIFICATION ERROR');
    assert.match(app.node('guide-content').textContent,/FRESH RESTORED NOTE/);
    assert.equal(app.node('admin-dashboard').hidden,false);assert.equal(app.requests.length,6);
    assert.ok(!app.node('guide-status').textContent.includes('STALE VERIFICATION ERROR'));
  }
});
