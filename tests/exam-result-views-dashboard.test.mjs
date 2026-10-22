import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {setImmediate as nextTurn} from 'node:timers/promises';

const html = fs.readFileSync(new URL('../admin.html',import.meta.url),'utf8');
const source = fs.readFileSync(new URL('../assets/dashboard.js',import.meta.url),'utf8');
class Element {
  constructor() { this.value=''; this.textContent=''; this.innerHTML=''; this.hidden=false; this.disabled=false; this.dataset={}; this.listeners={}; this.attributes={}; this.classList={add(){},remove(){}}; }
  addEventListener(type,handler) { this.listeners[type]=handler; }
  setAttribute(name,value) { this.attributes[name]=value; }
  removeAttribute(name) { delete this.attributes[name]; }
  replaceChildren() { this.innerHTML=''; this.textContent=''; }
  close() { this.open=false; }
}
const fixture = () => ({students:[
  {id:'s-1',name:'İpek <img src=x>',group:'B1',hasViewed:true,viewCount:2,firstViewedAt:'2026-10-22T12:00:00Z',lastViewedAt:'2026-10-22T13:00:00Z'},
  {id:'s-2',name:'Ada <script>',group:'A2',hasViewed:false,viewCount:0,firstViewedAt:null,lastViewedAt:null},
  {id:'s-3',name:'Ece',group:'B1',hasViewed:false,viewCount:0,firstViewedAt:null,lastViewedAt:null}
],stats:{total:3,viewed:1,notViewed:2}});
async function dashboard(initial = fixture()) {
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/g)].map(([,id]) => [id,new Element()]));
  const tabs = [...html.matchAll(/data-admin-tab="([^"]+)"/g)].map(([,tab]) => Object.assign(new Element(),{dataset:{adminTab:tab}}));
  const panels = [...html.matchAll(/data-admin-panel="([^"]+)"/g)].map(([,tab]) => Object.assign(new Element(),{dataset:{adminPanel:tab}}));
  const $ = id => elements.get(id);
  $('filter-visit').value='all'; $('filter-visit').parentElement=new Element(); $('exam-views-filter').value='all';
  let session = {role:'admin'}, response = initial, timerId=0;
  const calls=[], listeners={}, timers=new Map();
  const access = {ready:Promise.resolve(session),session:() => session,request:async route => {
    calls.push(route);
    if (route === '/api/admin/exam-result-views') {
      if (response instanceof Error) throw response;
      return response;
    }
    if (route.startsWith('/api/admin/overview?')) return {stats:{total:0},students:[],lessons:[],groups:[]};
    if (route === '/api/admin/presence') return {online:[],sessions:[]};
    if (route.startsWith('/api/admin/logs?')) return {events:[{type:'exam_results_view',studentName:'Example learner',lesson:'panel',activity:'exam-results',createdAt:'2026-10-22T12:00:00Z'}],nextCursor:null};
    throw new Error('Unexpected route: ' + route);
  }};
  vm.runInNewContext(source,{window:{EnglishAccess:access,location:{href:'https://example.test/admin.html'},addEventListener:(type,handler) => listeners[type]=handler},document:{body:{dataset:{accessPage:'admin'}},hidden:false,addEventListener(){},getElementById:id => {assert.ok(elements.has(id),id); return $(id);},querySelectorAll:selector => selector === '[data-admin-tab]' ? tabs : selector === '[data-admin-panel]' ? panels : []},Intl,URL,URLSearchParams,setTimeout:(handler,ms) => {const id=++timerId; timers.set(id,{handler,ms}); return id;},clearTimeout:id => timers.delete(id)});
  await nextTurn();
  return {$,calls,timers,setResponse:value => {response=value;},select:async tab => {tabs.find(button => button.dataset.adminTab === tab).listeners.click(); await nextTurn();},clear:event => {session=null; listeners[event]();}};
}

test('exam access tab loads lazily, shows all-student counts and filters only the list',async () => {
  const d = await dashboard(), {$,calls,timers}=d;
  assert.ok(!calls.includes('/api/admin/exam-result-views'));
  await d.select('exam-views');
  assert.equal(calls.filter(route => route === '/api/admin/exam-result-views').length,1);
  assert.equal($('shared-filters').hidden,true);
  assert.equal($('live-presence').hidden,true);
  assert.equal(timers.size,0,'the access tab does not poll');
  assert.match($('exam-views-summary').innerHTML,/Toplam öğrenci<\/span><strong>3<\/strong>/);
  assert.match($('exam-views-summary').innerHTML,/Baktı · sayfayı açtı<\/span><strong>1<\/strong>/);
  assert.match($('exam-views-summary').innerHTML,/Henüz bakmadı<\/span><strong>2<\/strong>/);
  assert.match($('exam-views-table').innerHTML,/İpek &lt;img src=x&gt;/);
  assert.match($('exam-views-table').innerHTML,/Ada &lt;script&gt;/);
  assert.ok(!$('exam-views-table').innerHTML.includes('<img'));
  assert.match($('exam-views-table').innerHTML,/15:00:00/,'first server time is displayed in Istanbul time');
  assert.match($('exam-views-table').innerHTML,/16:00:00/,'last server time is displayed in Istanbul time');
  const originalCalls=calls.length, summary=$('exam-views-summary').innerHTML;
  $('exam-views-filter').value='not-viewed'; $('exam-views-filter').listeners.change();
  assert.equal($('exam-views-count').textContent,'2 / 3 öğrenci gösteriliyor.');
  assert.ok(!$('exam-views-table').innerHTML.includes('İpek'));
  $('exam-views-group').value='B1'; $('exam-views-group').listeners.change();
  assert.equal($('exam-views-count').textContent,'1 / 3 öğrenci gösteriliyor.');
  assert.match($('exam-views-table').innerHTML,/Ece/);
  $('exam-views-filter').value='viewed'; $('exam-views-filter').listeners.change();
  $('exam-views-search').value='ipek'; $('exam-views-search').listeners.input();
  assert.match($('exam-views-table').innerHTML,/İpek &lt;img/,'Turkish name search handles dotted İ');
  $('exam-views-search').value='missing'; $('exam-views-search').listeners.input();
  assert.match($('exam-views-table').innerHTML,/Bu filtrelerle eşleşen öğrenci bulunmuyor/);
  assert.equal($('exam-views-summary').innerHTML,summary);
  assert.equal(calls.length,originalCalls,'local filters do not refetch or invoke shared filters');
  $('exam-views-clear').listeners.click();
  assert.equal($('exam-views-count').textContent,'3 / 3 öğrenci gösteriliyor.');
});

test('exam access retry refreshes its endpoint alone and distinguishes empty data from an error',async () => {
  const d=await dashboard(new Error('Bağlantı kurulamadı')), {$,calls}=d;
  await d.select('exam-views');
  assert.match($('exam-views-status').textContent,/Bağlantı kurulamadı.*Yenile/);
  assert.equal($('exam-views-summary').innerHTML,'');
  assert.equal($('refresh-data').disabled,false);
  d.setResponse({students:[],stats:{total:0,viewed:0,notViewed:0}});
  calls.length=0;
  await $('refresh-data').listeners.click();
  assert.deepEqual(calls,['/api/admin/exam-result-views']);
  assert.match($('exam-views-table').innerHTML,/Henüz aktif öğrenci bulunmuyor/);
  assert.equal($('exam-views-status').textContent,'');
  d.setResponse({...fixture(),stats:{total:3,viewed:0,notViewed:3}});
  await $('refresh-data').listeners.click();
  assert.match($('exam-views-status').textContent,/yanıtı doğrulanamadı/);
  assert.equal($('exam-views-summary').innerHTML,'','invalid data must not classify students as unseen');
});

test('exam access ignores older requests and clears late private responses on logout and expiry',async () => {
  for (const event of ['english:logout','english:session-expired']) {
    let releaseOld;
    const d=await dashboard(new Promise(resolve => {releaseOld=resolve;})), {$}=d;
    await d.select('exam-views');
    d.setResponse(fixture());
    await $('refresh-data').listeners.click();
    const latest=$('exam-views-table').innerHTML;
    releaseOld({students:[],stats:{total:0,viewed:0,notViewed:0}});
    await nextTurn();
    assert.equal($('exam-views-table').innerHTML,latest);
    let releasePrivate;
    d.setResponse(new Promise(resolve => {releasePrivate=resolve;}));
    const pending=$('refresh-data').listeners.click();
    $('exam-views-search').value='Private search';
    d.clear(event);
    releasePrivate(fixture()); await pending;
    for (const id of ['exam-views-summary','exam-views-table','exam-views-group']) assert.equal($(id).innerHTML,'',event + ': ' + id);
    for (const id of ['exam-views-count','exam-views-status','exam-views-updated']) assert.equal($(id).textContent,'',event + ': ' + id);
    assert.equal($('exam-views-search').value,'');
    $('exam-views-search').listeners.input();
    assert.equal($('exam-views-table').innerHTML,'','local rerender cannot recover cleared private data');
  }
});

test('durable exam access logs use the human page and event names',async () => {
  const d=await dashboard();
  await d.select('logs');
  assert.match(d.$('log-table').innerHTML,/Sınav sonuçları sayfasını açtı/);
  assert.match(d.$('log-table').innerHTML,/Sınav sonuçlarım/);
  assert.match(html,/<option value="exam_results_view">Sınav sonuçları sayfasını açtı<\/option>/);
  assert.match(html,/sayfayı açmak tüm sonuçların okunduğunu kanıtlamaz/);
});
