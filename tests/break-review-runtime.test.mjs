import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/break-review.js',import.meta.url),'utf8');

const entryLabel='☕ Bu molada seçtiğim sayfaların özetini göster';
function harness({breakScreen=true,callback=true}={}){
  let now=0,serial=0,currentTarget=null;const intervals=new Map(),storage=new Map(),events={},frames=new Map(),observers=[];
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.style={};this.dataset={};this.className='';this.textContent='';this.classList={toggle(){}};}
    append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
    replaceChildren(...nodes){for(const node of this.children)node.parent=null;this.children=[];this.append(...nodes);}
    get parentElement(){return this.parent||null;}
    get isConnected(){return this===document.body||Boolean(this.parent?.isConnected);}
    get firstElementChild(){return this.children[0];}
    setAttribute(k,v){this.attributes[k]=v;}
    removeAttribute(k){delete this.attributes[k];}
    addEventListener(k,fn){this.listeners[k]=fn;}
    matches(selector){return selector.split(',').some(raw=>{const part=raw.trim();if(part.startsWith('.'))return this.className.split(' ').includes(part.slice(1));if(part.startsWith('[')){const [,name,value]=part.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/)||[];const actual=name?.startsWith('data-')?this.dataset[name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]:this.attributes[name];return actual!==undefined&&(value===undefined||actual===value)}return this.tag===part});}
    querySelectorAll(selector){return this.children.flatMap(node=>[...(node.matches(selector)?[node]:[]),...node.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(selector){return this.matches(selector)?this:this.parent?.closest(selector)||null;}
    contains(node){return node===this||this.children.some(child=>child.contains(node));}
    getClientRects(){return this.isConnected&&!this.closest('[hidden], [aria-hidden="true"]')&&this.style.display!=='none'?[{}]:[];}
    focus(){document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null;}
    click(){if(!this.disabled)this.listeners.click?.({});}
  }
  const document={body:new Element('body'),activeElement:null,createElement:t=>new Element(t),querySelectorAll:selector=>document.body.querySelectorAll(selector),addEventListener:(name,fn)=>{events[name]=fn},removeEventListener(){}};
  document.querySelector=selector=>document.querySelectorAll(selector)[0]||null;
  const content=new Element('main');document.body.append(content);
  const flush=()=>{while(frames.size){const pending=[...frames.values()];frames.clear();for(const fn of pending)fn()}};
  const mutate=()=>{for(const observer of observers)if(observer.active)observer.fn([{target:content}]);flush()};
  const visitBreak=()=>{currentTarget=new Element('section');currentTarget.className='break-text';content.replaceChildren(currentTarget);mutate();return currentTarget};
  const visitNormal=()=>{currentTarget=null;const ordinary=new Element('section');ordinary.className='break-inside';content.replaceChildren(ordinary);mutate();return ordinary};
  if(breakScreen)visitBreak();else visitNormal();
  const window={};
  vm.runInNewContext(source,{window,document,location:{pathname:'/lessons/a2/demo.html'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},MutationObserver:class{constructor(fn){this.fn=fn;observers.push(this)}observe(){this.active=true}disconnect(){this.active=false}},requestAnimationFrame:fn=>{const id=++serial;frames.set(id,fn);return id},cancelAnimationFrame:id=>frames.delete(id),setInterval:fn=>{const id=++serial;intervals.set(id,fn);return id},clearInterval:id=>intervals.delete(id),Date:{now:()=>now}});
  const nodes=()=>{const visit=n=>[n,...n.children.flatMap(visit)];return visit(document.body)};
  const byText=t=>nodes().find(n=>n.tag==='button'&&n.textContent===t);
  const byClass=c=>nodes().find(n=>n.className.split(' ').includes(c));
  const advance=ms=>{now+=ms;for(const fn of [...intervals.values()])fn()};
  const timerCalls=[];
  const registration=window.EnglishBreakReview.register({pages:[0,1,2].map(index=>({id:'p'+index,index,title:'Topic '+index,summary:['Rule '+index],examples:[{en:'Example '+index,tr:'Örnek '+index}]})),getIndex:()=>1,...(callback?{getBreakTarget:()=>currentTarget}:{}),timer:{set:n=>timerCalls.push(['set',n]),start:()=>timerCalls.push(['start']),stop:()=>timerCalls.push(['stop'])}});
  return {document,nodes,byText,byClass,advance,intervals,events,timerCalls,storage,visitBreak,visitNormal,mutate,content,Element,registration};
}

test('only reached pages are selectable; empty selection prevents start',()=>{
  const h=harness();h.byText(entryLabel).click();
  assert.equal(h.document.body.querySelectorAll('input').length,2);
  h.byText('Seçimi temizle').click();assert.equal(h.byText('Özetli molayı başlat').disabled,true);
  h.byText('Tümünü seç').click();assert.equal(h.byText('Özetli molayı başlat').disabled,false);
});

test('15 minute break rotates selected summaries, pauses both clocks, resumes and finishes',()=>{
  const h=harness();h.byText(entryLabel).click();
  const selects=h.document.body.querySelectorAll('select');selects[0].value='15';selects[1].value='10';
  h.byText('Özetli molayı başlat').click();
  assert.equal(h.byClass('ebr-countdown').textContent,'15:00');
  assert.equal(h.byClass('ebr-summary-card').children[1].textContent,'Topic 0');
  h.advance(10000);assert.equal(h.byClass('ebr-summary-card').children[1].textContent,'Topic 1');
  assert.equal(h.byClass('ebr-countdown').textContent,'14:50');
  h.byText('Duraklat').click();h.advance(60000);
  assert.equal(h.byClass('ebr-countdown').textContent,'14:50');
  assert.equal(h.byClass('ebr-summary-card').children[1].textContent,'Topic 1');
  h.byText('Devam et').click();h.advance(10000);
  assert.equal(h.byClass('ebr-summary-card').children[1].textContent,'Topic 0');
  h.advance(880000);assert.ok(h.nodes().some(n=>n.textContent==='Mola bitti'));
  assert.equal(h.intervals.size,0);assert.deepEqual(h.timerCalls.at(-1),['set',0]);
});

test('selected pages persist; dialog intercepts lesson shortcuts and restores the lesson on Escape',()=>{
  const h=harness();h.byText(entryLabel).click();h.byText('Seçimi temizle').click();
  const input=h.document.body.querySelectorAll('input')[1];input.checked=true;input.listeners.change();
  h.document.body.querySelectorAll('select')[0].value='10';h.document.body.querySelectorAll('select')[1].value='15';
  h.byText('Özetli molayı başlat').click();assert.equal(h.byClass('ebr-slide-counter').textContent,'1 / 1 özet');
  let stopped=false,prevented=false;
  h.events.keydown({key:'Escape',stopImmediatePropagation(){stopped=true},preventDefault(){prevented=true}});
  assert.ok(stopped&&prevented);assert.equal(h.intervals.size,0);assert.equal(h.byClass('ebr-dialog').open,false);
  h.byText(entryLabel).click();
  const inputs=h.document.body.querySelectorAll('input');assert.equal(inputs[0].checked,false);assert.equal(inputs[1].checked,true);
});

test('ordinary lesson and home screens have no launcher; only the break screen gets an entry',()=>{
  const h=harness({breakScreen:false});
  assert.equal(h.byClass('ebr-launcher'),undefined);
  assert.equal(h.byText(entryLabel),undefined);
  const target=h.visitBreak();
  assert.equal(h.byText(entryLabel).parentElement,target);
  h.mutate();assert.equal(h.nodes().filter(node=>node.matches('[data-break-review-inline]')).length,1);
  h.visitNormal();assert.equal(h.byText(entryLabel),undefined);
  const next=h.visitBreak();assert.equal(h.byText(entryLabel).parentElement,next);
});

test('leaving the break stops and closes the recap and removes its detached entry button',()=>{
  const h=harness(),entry=h.byText(entryLabel);entry.click();
  h.byText('Özetli molayı başlat').click();assert.equal(h.intervals.size,1);
  h.visitNormal();
  assert.equal(h.byText(entryLabel),undefined);
  assert.equal(entry.isConnected,false);
  assert.equal(h.byClass('ebr-dialog').open,false);
  assert.equal(h.intervals.size,0);
  assert.deepEqual(h.timerCalls.at(-1),['stop']);
  entry.click();assert.equal(h.byClass('ebr-dialog').open,false);
});

test('adapter null is authoritative even if another visible break target exists',()=>{
  const h=harness({breakScreen:false});
  const unrelated=new h.Element('div');unrelated.className='break-text';h.content.append(unrelated);h.mutate();
  assert.equal(h.byText(entryLabel),undefined);
});

test('fallback ignores generic break-inside styling and hidden break screens',()=>{
  const h=harness({breakScreen:false,callback:false});
  assert.equal(h.byText(entryLabel),undefined);
  const hidden=new h.Element('section');hidden.className='break-text';hidden.setAttribute('hidden','');h.content.append(hidden);h.mutate();
  assert.equal(h.byText(entryLabel),undefined);
  hidden.removeAttribute('hidden');h.mutate();assert.equal(h.byText(entryLabel).parentElement,hidden);
  hidden.setAttribute('aria-hidden','true');h.mutate();assert.equal(h.byText(entryLabel),undefined);
});

test('destroy removes the break entry and closes an open recap',()=>{
  const h=harness();h.byText(entryLabel).click();h.byText('Özetli molayı başlat').click();h.registration.destroy();
  assert.equal(h.byText(entryLabel),undefined);assert.equal(h.byClass('ebr-dialog'),undefined);assert.equal(h.intervals.size,0);
});
