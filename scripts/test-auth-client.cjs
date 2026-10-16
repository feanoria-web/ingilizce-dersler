const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const code = fs.readFileSync(path.join(__dirname,'../assets/auth-client.js'),'utf8');
class Element {
  constructor() {this.value=''; this.textContent=''; this.hidden=false; this.disabled=false; this.dataset={}; this.listeners={}; this.children=[]; this.attrs={}; this.classes=new Set(); this.classList={add:(name)=>this.classes.add(name),remove:(name)=>this.classes.delete(name),toggle:(name,on)=>on?this.classes.add(name):this.classes.delete(name),contains:(name)=>this.classes.has(name)};}
  addEventListener(type,fn) {this.listeners[type]=fn;}
  setAttribute(key,value) {this.attrs[key]=value;}
  append(...items) {this.children.push(...items);}
  prepend(...items) {this.children.unshift(...items);}
  querySelector(selector) {if(selector==='[type=submit]') return this.button ||= new Element(); if(selector==='p') return this.children.find(item=>item.tag==='p') || null; return null;}
  focus() {} remove() {this.removed=true;}
}
function setup({page='protected',origin='https://feanoria-web.github.io',search='',saved,config,identity,status=200,loginResult,networkError=false}={}) {
  const elements = new Map();
  for(const id of ['student-login','student-password','login-error','admin-login','admin-password','admin-login-error','admin-signin','admin-dashboard']) elements.set(id,new Element());
  elements.get('admin-dashboard').hidden=true;
  const body=new Element(); body.dataset.accessPage=page;
  const documentElement=new Element(); documentElement.classList.add('access-pending');
  const storage=new Map(saved===undefined?[]:[['english-access-v1',saved]]);
  const calls=[], redirects=[], events=[];
  const url=new URL(origin+'/ingilizce-dersler/'+(page==='login'?'login.html':page==='admin'?'admin.html':'lessons/a2/day-01.html')+search);
  const location={origin:url.origin,hostname:url.hostname,protocol:url.protocol,pathname:url.pathname,search:url.search,hash:url.hash,href:url.href,replace:value=>redirects.push(String(value))};
  const document={body,documentElement,currentScript:{src:origin+'/ingilizce-dersler/assets/auth-client.js'},createElement:tag=>{const element=new Element(); element.tag=tag; return element;},querySelector:selector=> selector==='.access-status'?body.children.find(item=>item.className==='access-status')||null:selector==='.access-status p'?(body.children.find(item=>item.className==='access-status')?.querySelector('p')||null):null,querySelectorAll:()=>[],getElementById:id=>elements.get(id)||null};
  const context={document,location,URL,URLSearchParams,Headers,AbortController,FormData,Blob,Event,CustomEvent:class CustomEvent extends Event {constructor(type,opts){super(type);this.detail=opts.detail;}},setTimeout,clearTimeout,sessionStorage:{getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,value),removeItem:key=>storage.delete(key)},ACCESS_CONFIG:config===undefined?{apiBase:''}:config,addEventListener:()=>{},dispatchEvent:event=>{events.push(event.type);return true;},fetch:async(url,options)=>{calls.push({url,options});events.push('fetch:'+new URL(url).pathname); if(networkError) throw new Error('network'); const isLogin=/\/login$/.test(url);const data=isLogin?loginResult:identity; return {ok:status>=200&&status<300,status,headers:new Headers({'content-type':'application/json'}),json:async()=>data,text:async()=>JSON.stringify(data)};}};
  context.window=context;
  vm.runInNewContext(code,context,{filename:'auth-client.js'});
  return {context,elements,body,storage,calls,redirects,events};
}
const session={token:'12345678901234567890123456789012',role:'student',student:{id:'s-test',name:'Test Öğrenci',group:'A2'},expiresAt:'2099-01-01T00:00:00Z'};
async function login(environment,password='test') {environment.elements.get('student-password').value=password; await environment.elements.get('student-login').listeners.submit({preventDefault(){}});}
async function run() {
  let assertions=0;
  let env=setup({page:'login'}); await env.context.EnglishAccess.ready; assert.match(env.elements.get('login-error').textContent,/Merkezi giriş hizmeti henüz bağlanmadı/); assert.equal(env.calls.length,0); await assert.rejects(()=>env.context.EnglishAccess.request('/api/auth/me'),/Merkezi giriş/); assertions+=3;
  env=setup(); await env.context.EnglishAccess.ready; assert.ok(env.body.classList.contains('access-locked')); assert.match(env.body.querySelector('p')?.textContent||env.body.children[0].querySelector('p').textContent,/Merkezi giriş/); assert.equal(env.calls.length,0); assertions+=3;
  env=setup({origin:'http://127.0.0.1:8787',saved:'{bad json'}); await env.context.EnglishAccess.ready; assert.equal(env.context.EnglishAccess.apiBase,'http://127.0.0.1:8787'); assert.equal(env.calls.length,0); assert.match(env.redirects[0],/login\.html\?return=lessons/); assertions+=3;
  env=setup({config:{apiBase:'https://api.example.test'},saved:JSON.stringify(session),identity:{role:'student',student:session.student}}); const ready=await env.context.EnglishAccess.ready; assert.equal(ready.student.name,'Test Öğrenci');assert.equal(env.body.classList.contains('access-locked'),false);assert.equal(env.calls[0].options.headers.get('authorization'),'Bearer '+session.token);assert.equal(env.calls[0].options.credentials,'omit');assert.equal(env.calls[0].url,'https://api.example.test/api/auth/me');assert.equal(env.context.document.documentElement.classList.contains('access-pending'),false);assert.ok(env.events.includes('english:ready'));assert.equal(env.calls[0].options.cache,'no-store'); assertions+=8;
  env=setup({config:{apiBase:'https://api.example.test'},saved:JSON.stringify(session),identity:{error:'Oturum geçersiz'},status:401});await env.context.EnglishAccess.ready;assert.equal(env.storage.size,0);assert.ok(env.body.classList.contains('access-locked'));assert.match(env.redirects[0],/login\.html/); assertions+=3;
  env=setup({config:{apiBase:'https://api.example.test'},saved:JSON.stringify(session),identity:{role:'admin'}});await env.context.EnglishAccess.ready;assert.equal(env.storage.size,0);assert.ok(env.body.classList.contains('access-locked')); assertions+=2;
  env=setup({config:{apiBase:'https://api.example.test'},saved:JSON.stringify(session),networkError:true});await env.context.EnglishAccess.ready;assert.ok(env.body.classList.contains('access-locked'));assert.match(env.body.children[0].querySelector('p').textContent,/ulaşılamıyor/); assertions+=2;
  env=setup({page:'admin',config:{apiBase:'https://api.example.test'},saved:JSON.stringify(session),identity:{role:'student',student:session.student}});await env.context.EnglishAccess.ready;assert.equal(env.elements.get('admin-dashboard').hidden,true);assert.equal(env.elements.get('admin-signin').hidden,false); assertions+=2;
  env=setup({page:'admin',config:{apiBase:'https://api.example.test'},saved:JSON.stringify({...session,role:'admin'}),identity:{role:'admin'}});await env.context.EnglishAccess.ready;assert.equal(env.elements.get('admin-dashboard').hidden,false);assert.equal(env.elements.get('admin-signin').hidden,true); assertions+=2;
  const unsafe=['//evil.example','https://evil.example','javascript:alert(1)','../other-project/','\\evil.example','admin.html','login.html','/another-project/index.html'];
  for(const value of unsafe) {env=setup({page:'login',config:{apiBase:'https://api.example.test'},search:'?return='+encodeURIComponent(value),loginResult:session});await env.context.EnglishAccess.ready;await login(env,'secret-not-stored');assert.equal(env.redirects[0],'https://feanoria-web.github.io/ingilizce-dersler/index.html');assert.ok(!env.storage.get('english-access-v1').includes('secret-not-stored'));assert.equal(env.elements.get('student-password').value,'');assert.equal(env.calls[0].options.headers.get('authorization'),null);assert.equal(env.calls[0].options.headers.get('content-type'),'application/json'); assertions+=5;}
  env=setup({page:'login',config:{apiBase:'https://api.example.test'},search:'?return=lessons%2Fa2%2Fday-01.html%23vocab',loginResult:session});await env.context.EnglishAccess.ready;await login(env);assert.equal(env.redirects[0],'https://feanoria-web.github.io/ingilizce-dersler/lessons/a2/day-01.html#vocab'); assertions++;
  env=setup({page:'login',config:{apiBase:'http://api.example.test'}});await env.context.EnglishAccess.ready;assert.match(env.elements.get('login-error').textContent,/HTTPS/);assert.equal(env.calls.length,0); assertions+=2;
  env=setup({config:{apiBase:'https://api.example.test'},saved:JSON.stringify(session),identity:{role:'student',student:session.student}});await env.context.EnglishAccess.ready;await env.context.EnglishAccess.logout();assert.equal(env.storage.size,0);assert.ok(env.events.indexOf('english:logout')<env.events.indexOf('fetch:/api/auth/logout'));assert.match(env.redirects[0],/login\.html$/); assertions+=3;
  env=setup({config:{apiBase:'https://api.example.test'},saved:JSON.stringify(session),identity:{role:'student',student:session.student}});await env.context.EnglishAccess.ready;await env.context.EnglishAccess.request('/api/events',{method:'POST',body:'{"events":[]}'});assert.equal(env.calls.at(-1).options.headers.get('content-type'),'application/json');await env.context.EnglishAccess.request('/api/events',{method:'POST',body:'{}',headers:{'Content-Type':'application/custom+json'}});assert.equal(env.calls.at(-1).options.headers.get('content-type'),'application/custom+json');assertions+=2;
  process.stdout.write(JSON.stringify({ok:true,assertions,scenarios:['unconfigured public fail closed','localhost same-origin','malformed session','student authentication','invalid session','role mismatch','network failure closed','admin role separation','redirect allowlist','password not stored','HTTPS configuration','logout ordering','tracker JSON string content type']},null,2)+'\n');
}
run().catch(error=>{process.stderr.write(error.stack+'\n');process.exitCode=1;});
