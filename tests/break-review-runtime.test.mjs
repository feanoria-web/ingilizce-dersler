import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../assets/break-review.js',import.meta.url),'utf8');

function harness(){
  let now=0,serial=0;const intervals=new Map(),storage=new Map(),events={};
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.listeners={};this.attributes={};this.style={};this.dataset={};this.className='';this.textContent='';this.isConnected=true;this.classList={toggle(){}};}
    append(...nodes){for(const node of nodes){node.parent=this;this.children.push(node);}}
    replaceChildren(...nodes){this.children=[];this.append(...nodes);}
    get firstElementChild(){return this.children[0];}
    setAttribute(k,v){this.attributes[k]=v;}
    removeAttribute(k){delete this.attributes[k];}
    addEventListener(k,fn){this.listeners[k]=fn;}
    querySelectorAll(selector){return this.children.flatMap(node=>[...(node.tag===selector?[node]:[]),...node.querySelectorAll(selector)]);}
    querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
    closest(){return null;}
    focus(){document.activeElement=this;}
    showModal(){this.open=true;}
    close(){this.open=false;}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);}
    click(){if(!this.disabled)this.listeners.click?.({});}
  }
  const document={body:new Element('body'),activeElement:null,createElement:t=>new Element(t),querySelector:()=>null,addEventListener:(name,fn)=>{events[name]=fn},removeEventListener(){}};
  const window={};
  vm.runInNewContext(source,{window,document,location:{pathname:'/lessons/a2/demo.html'},localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)},MutationObserver:class{observe(){}disconnect(){}},requestAnimationFrame:fn=>{fn();return ++serial},cancelAnimationFrame(){},setInterval:fn=>{const id=++serial;intervals.set(id,fn);return id},clearInterval:id=>intervals.delete(id),Date:{now:()=>now}});
  const nodes=()=>{const visit=n=>[n,...n.children.flatMap(visit)];return visit(document.body)};
  const byText=t=>nodes().find(n=>n.tag==='button'&&n.textContent===t);
  const byClass=c=>nodes().find(n=>n.className.split(' ').includes(c));
  const advance=ms=>{now+=ms;for(const fn of [...intervals.values()])fn()};
  const timerCalls=[];
  window.EnglishBreakReview.register({pages:[0,1,2].map(index=>({id:'p'+index,index,title:'Topic '+index,summary:['Rule '+index],examples:[{en:'Example '+index,tr:'Örnek '+index}]})),getIndex:()=>1,timer:{set:n=>timerCalls.push(['set',n]),start:()=>timerCalls.push(['start']),stop:()=>timerCalls.push(['stop'])}});
  return {document,nodes,byText,byClass,advance,intervals,events,timerCalls,storage};
}

test('only reached pages are selectable; empty selection prevents start',()=>{
  const h=harness();h.byText('☕ Mola özeti').click();
  assert.equal(h.document.body.querySelectorAll('input').length,2);
  h.byText('Seçimi temizle').click();assert.equal(h.byText('Özetli molayı başlat').disabled,true);
  h.byText('Tümünü seç').click();assert.equal(h.byText('Özetli molayı başlat').disabled,false);
});

test('15 minute break rotates selected summaries, pauses both clocks, resumes and finishes',()=>{
  const h=harness();h.byText('☕ Mola özeti').click();
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
  const h=harness();h.byText('☕ Mola özeti').click();h.byText('Seçimi temizle').click();
  const input=h.document.body.querySelectorAll('input')[1];input.checked=true;input.listeners.change();
  h.document.body.querySelectorAll('select')[0].value='10';h.document.body.querySelectorAll('select')[1].value='15';
  h.byText('Özetli molayı başlat').click();assert.equal(h.byClass('ebr-slide-counter').textContent,'1 / 1 özet');
  let stopped=false,prevented=false;
  h.events.keydown({key:'Escape',stopImmediatePropagation(){stopped=true},preventDefault(){prevented=true}});
  assert.ok(stopped&&prevented);assert.equal(h.intervals.size,0);assert.equal(h.byClass('ebr-dialog').open,false);
  h.byText('☕ Mola özeti').click();
  const inputs=h.document.body.querySelectorAll('input');assert.equal(inputs[0].checked,false);assert.equal(inputs[1].checked,true);
});
