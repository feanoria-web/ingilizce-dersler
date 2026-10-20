import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { buildCatalog } from '../scripts/build-catalog.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(ROOT, 'assets/app.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const record = (name, patch = {}) => ({id:`a2/${name}`,level:'A2',title:`New ${name}`,description:'Class work',
  number:1,order:1,date:'2026-10-20',duration:'60 dk',tags:['Review'],url:`lessons/a2/${name}.html`,...patch});

class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.listeners = new Map(); this.value = ''; this.writes = 0; this.html = ''; }
  set innerHTML(value) { this.html = value; this.writes++; }
  get innerHTML() { return this.html; }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, listener) { this.listeners.set(name, listener); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
}

function app({initial = [record('old')], hidden = false, network = async () => ({ok:true,json:async () => initial})} = {}) {
  const names = ['lessons-section','lesson-list','lesson-search','empty-state','empty-title','empty-description',
    'results-status','welcome-note','selected-label','lessons-title'];
  const elements = new Map(names.map(name => [name,new Element()]));
  const counts = ['A1','A2','B1','YDS'].map(count => new Element({count}));
  const buttons = ['A1','A2','B1','YDS'].map(level => new Element({level}));
  const windowListeners = new Map(), documentListeners = new Map(), intervals = [];
  const calls = [];
  let timerId = 0;
  const document = {
    visibilityState:hidden?'hidden':'visible', currentScript:{src:'https://feanoria-web.github.io/ingilizce-dersler/assets/app.js?v=old'},
    getElementById:name => { assert.ok(elements.has(name),name); return elements.get(name); },
    querySelectorAll:query => query === '[data-level]' ? buttons : query === '[data-count]' ? counts : [],
    addEventListener:(name,listener) => documentListeners.set(name,listener),
  };
  const location = {hash:'#A2',href:'https://feanoria-web.github.io/ingilizce-dersler/index.html#A2',
    reload:() => { throw new Error('An open page must not reload'); }};
  const window = {LESSON_CATALOG:initial,scrollX:0,scrollY:640,
    addEventListener:(name,listener) => windowListeners.set(name,listener),
    scrollTo({left,top}) { this.scrollX=left;this.scrollY=top; }};
  vm.runInNewContext(source, {window,document,location,URL,Intl,AbortController,
    history:{pushState:(_state,_title,hash) => {location.hash=hash;}},matchMedia:() => ({matches:true}),
    fetch:async (...args) => {calls.push(args);return network(...args);},
    setInterval:(fn,ms) => {intervals.push({fn,ms});return ++timerId;},setTimeout:() => ++timerId,clearTimeout() {},
  });
  return {elements,counts,buttons,document,window,calls,location,intervals,
    async visible(value) { document.visibilityState=value?'visible':'hidden';documentListeners.get('visibilitychange')();await tick(); },
    async online() { windowListeners.get('online')();await tick(); },
    async poll() { assert.equal(intervals[0].ms,60000);intervals[0].fn();await tick(); },
    search(value) { elements.get('lesson-search').value=value;elements.get('lesson-search').listeners.get('input')(); },
  };
}

test('a newly published lesson appears without resetting the selected level, query, hash or scroll', async () => {
  let answer = [record('old')];
  const runtime = app({network:async () => ({ok:true,json:async () => answer})});
  await tick();
  runtime.search('fresh');
  const previousWrites = runtime.elements.get('lesson-list').writes;
  answer = [record('old'),record('fresh',{title:'Fresh classroom lesson',number:2,order:2})];
  await runtime.poll();
  const html = runtime.elements.get('lesson-list').innerHTML;
  assert.match(html,/Fresh classroom lesson/);
  assert.doesNotMatch(html,/New old/);
  assert.equal(runtime.elements.get('lesson-search').value,'fresh');
  assert.equal(runtime.buttons[1]['aria-pressed'],'true');
  assert.equal(runtime.location.hash,'#A2');
  assert.equal(runtime.window.scrollY,640);
  assert.equal(runtime.counts[1].textContent,'2 ders içeriği');
  assert.equal(runtime.elements.get('lesson-list').writes,previousWrites+1);
  assert.equal(runtime.calls.at(-1)[0],'https://feanoria-web.github.io/ingilizce-dersler/assets/catalog.json');
  assert.equal(runtime.calls.at(-1)[1].cache,'no-store');
  assert.equal(runtime.calls.at(-1)[1].credentials,'omit');
});

test('unchanged records and mere JSON property reordering leave the current menu DOM alone', async () => {
  const initial = [record('old')];
  const runtime = app({initial,network:async () => ({ok:true,json:async () => initial.map(value => Object.fromEntries(Object.entries(value).reverse()))})});
  await tick();
  const writes = runtime.elements.get('lesson-list').writes;
  await runtime.poll();
  await runtime.online();
  assert.equal(runtime.elements.get('lesson-list').writes,writes);
});

test('the server’s valid lesson ordering is reflected without changing the chosen level', async () => {
  const initial = [record('first'),record('second')];
  const runtime = app({initial,network:async () => ({ok:true,json:async () => [initial[1],initial[0]]})});
  await tick();
  const html = runtime.elements.get('lesson-list').innerHTML;
  assert.ok(html.indexOf('New second') < html.indexOf('New first'));
  assert.equal(runtime.buttons[1]['aria-pressed'],'true');
});

test('network, malformed JSON and HTTP failures retain the last working lesson list', async () => {
  const initial = [record('old')];
  let mode = 'network';
  const runtime = app({initial,network:async () => {
    if (mode === 'network') throw new Error('offline');
    if (mode === 'http') return {ok:false,status:503,json:async () => {throw new Error('must not read');}};
    return {ok:true,json:async () => {throw new SyntaxError('deployment incomplete');}};
  }});
  await tick();
  const html = runtime.elements.get('lesson-list').innerHTML;
  mode='http';await runtime.poll();
  mode='json';await runtime.online();
  assert.equal(runtime.elements.get('lesson-list').innerHTML,html);
  assert.equal(runtime.counts[1].textContent,'1 ders içeriği');
});

test('unsafe or incomplete catalog records never replace the valid menu', async () => {
  let answer;
  const initial = [record('old')];
  const runtime = app({initial,network:async () => ({ok:true,json:async () => answer})});
  await tick();
  const html = runtime.elements.get('lesson-list').innerHTML;
  const bad = [null,{},'not an array',[record('safe'),record('safe')],
    [record('bad',{url:'javascript:alert(1)'})], [record('bad',{level:'C1'})],
    [record('bad',{url:'lessons/a2/../bad.html'})], [record('bad',{url:'lessons/a2/%2e%2e/bad.html'})],
    [record('bad',{url:'lessons/a2/sub%2Fbad.html'})], [record('bad',{url:'lessons/a2/bad.html?redirect=elsewhere'})],
    [record('bad',{id:'other/id'})], [record('bad',{title:''})],
    [record('bad',{description:undefined})], [record('bad',{number:-1})],
    [record('bad',{date:'2026-02-31'})], [record('bad',{tags:['Review',null]})]];
  for (answer of bad) {
    await runtime.poll();
    assert.equal(runtime.elements.get('lesson-list').innerHTML,html,JSON.stringify(answer));
  }
});

test('a hidden menu performs no startup, timer or online download and refreshes when visible', async () => {
  const runtime = app({hidden:true});
  await tick();await runtime.poll();await runtime.online();
  assert.equal(runtime.calls.length,0);
  await runtime.visible(true);
  assert.equal(runtime.calls.length,1);
  await runtime.visible(false);await runtime.poll();
  assert.equal(runtime.calls.length,1);
});

test('simultaneous resume, online and timer signals share a single in-flight request', async () => {
  let complete;
  const runtime = app({network:() => new Promise(resolve => {complete=resolve;})});
  await tick();
  await runtime.visible(true);await runtime.online();await runtime.poll();
  assert.equal(runtime.calls.length,1);
  runtime.search('arrived');
  complete({ok:true,json:async () => [record('arrived')]});
  await tick();
  assert.match(runtime.elements.get('lesson-list').innerHTML,/New arrived/);
  assert.equal(runtime.elements.get('lesson-search').value,'arrived');
  await runtime.poll();
  assert.equal(runtime.calls.length,2);
  complete({ok:false});await tick();
});

test('catalog build publishes JSON with exactly the same records as the embedded script', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'english-catalog-refresh-'));
  try {
    await fs.mkdir(path.join(root,'lessons/a2'),{recursive:true});
    await fs.writeFile(path.join(root,'lessons/a2/new.html'),'<html><head><title>Fresh lesson</title></head><body>Class work</body></html>');
    const catalog = await buildCatalog({root});
    const json = JSON.parse(await fs.readFile(path.join(root,'assets/catalog.json'),'utf8'));
    const context = {window:{}};
    vm.runInNewContext(await fs.readFile(path.join(root,'assets/catalog.js'),'utf8'),context);
    assert.deepEqual(json,catalog);
    assert.equal(JSON.stringify(context.window.LESSON_CATALOG),JSON.stringify(json));
    assert.equal(json[0].url,'lessons/a2/new.html');
  } finally {
    assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('english-catalog-refresh-'));
    await fs.rm(root,{recursive:true,force:true});
  }
});
