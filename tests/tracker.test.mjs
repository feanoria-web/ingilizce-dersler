import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';
import { instrumentHtml } from '../scripts/inject-access.mjs';

const tracker = await fs.readFile(new URL('../assets/activity-tracker.js', import.meta.url), 'utf8');

class FakeElement {
  constructor(attributes = {}, classes = []) {
    this.attributes = attributes;
    this.id = attributes.id || '';
    this.value = attributes.value || '';
    this.textContent = attributes.text || '';
    this.tagName = attributes.tagName || 'BUTTON';
    this.options = attributes.options || [];
    this.isContentEditable = attributes.contenteditable === 'true';
    this.disabled = false;
    this.classes = new Set(classes);
    this.classList = { contains: (name) => this.classes.has(name) };
  }
  hasAttribute(name) { return Object.hasOwn(this.attributes, name); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  closest(selector) {
    if (selector === '.word-card,.flashcard,.vcard') return ['word-card', 'flashcard', 'vcard'].some((name) => this.classes.has(name)) ? this : null;
    if (selector === '.flashcard[data-word]') return this.classes.has('flashcard') && this.hasAttribute('data-word') ? this : null;
    if (selector === 'input,textarea,select,button') return null;
    if (selector === '[data-host],.q-item,.flip-card') return null;
    return this;
  }
}

async function harness({ id = 'student-1', storage = new Map(), offline = false, focused = true, pathname = '/ingilizce-dersler/lessons/a2/day-01.html', hash = '#1', epoch = Date.now(), holdFirstPresence = false } = {}) {
  const docListeners = new Map();
  const winListeners = new Map();
  const intervals = new Map();
  const requests = [];
  const presenceRequests=[]; const presenceOptions=[];
  let now = 0;
  let nextTimer = 0;
  let uuid = 0;
  let current = { student: { id }, role: 'student' };
  let releasePresence;
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [epoch + now])); }
    static now() { return epoch + now; }
  }
  const on = (listeners, kind, callback) => listeners.set(kind, [...(listeners.get(kind) || []), callback]);
  const document = {
    visibilityState: 'visible', board: null, focused, title: 'English A2 · Ders 1', elements: new Map(), selectors: new Map(),
    hasFocus: () => document.focused,
    addEventListener: (kind, callback) => on(docListeners, kind, callback),
    getElementById: (key) => document.elements.get(key) || (key === 'board-jump' ? document.board : null),
    querySelector: (selector) => document.selectors.get(selector) || null,
    querySelectorAll: (selector) => { const result = document.selectors.get(selector); return Array.isArray(result) ? result : result ? [result] : []; },
    removeEventListener: (kind,callback) => docListeners.set(kind,(docListeners.get(kind)||[]).filter(item=>item!==callback)),
  };
  const window = {
    addEventListener: (kind, callback) => on(winListeners, kind, callback),
    removeEventListener: (kind,callback) => winListeners.set(kind,(winListeners.get(kind)||[]).filter(item=>item!==callback)),
    EnglishAccess: {
      ready: Promise.resolve(current),
      session: () => current,
      request: async (url, options) => {
        if(url==='/api/presence'){presenceRequests.push(typeof options.body==='string'?JSON.parse(options.body):options.body);presenceOptions.push(options);if(holdFirstPresence&&presenceRequests.length===1)return await new Promise(resolve=>{releasePresence=resolve;});return {ok:true};}
        assert.equal(options.headers['Content-Type'], 'application/json');
        requests.push({ url, keepalive:options.keepalive, ...JSON.parse(options.body) });
        return { accepted: JSON.parse(options.body).events.length };
      },
    },
  };
  const context = {
    window, document, location: { pathname, hash, search: '?private=secret' },
    Date: ClockDate, navigator: { onLine: !offline }, performance: { now: () => now }, Element: FakeElement,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval: (callback, ms) => { const key = ++nextTimer; intervals.set(key, { callback, ms }); return key; },
    clearInterval: (key) => intervals.delete(key),
  };
  vm.runInNewContext(tracker, context);
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  await settle();
  return {
    context, storage, requests,presenceRequests,presenceOptions, document, settle, epoch,
    releasePresence: async () => { releasePresence?.({ok:true}); await settle(); },
    events: () => [...new Map([...requests.flatMap(request => request.events), ...JSON.parse(storage.get(`en-access-events:${id}`) || '[]')].map(event=>[event.eventId,event])).values()],
    jump: async (ms) => { now += ms; for (const {callback} of intervals.values()) callback(); await settle(); },
    setSession: (session) => { current = session; },
    advance: async (ms) => {
      const steps = Math.ceil(ms / 500);
      for (let index = 0; index < steps; index++) {
        now += Math.min(500, ms - index * 500);
        for (const [key, timer] of [...intervals]) if (now % timer.ms === 0 && intervals.has(key)) timer.callback();
        await settle();
      }
    },
    emit: async (kind, event = {}, target = 'document') => {
      for (const callback of (target === 'window' ? winListeners : docListeners).get(kind) || []) callback({type:kind,...event});
      await settle();
    },
    pending: () => JSON.parse(storage.get(`en-access-events:${id}`) || '[]'),
  };
}

test('HTML injection is relative, idempotent and keeps existing classes', () => {
  const html = '<!doctype html><html lang="tr" class="lesson"><head><meta charset="utf-8"></head><body>Hello</body></html>';
  const output = instrumentHtml(html, 'lessons/a2/day-01.html');
  assert.match(output, /class="lesson access-pending"/);
  assert.match(output, /src="\.\.\/\.\.\/assets\/activity-tracker.js" defer/);
  assert.equal(instrumentHtml(output, 'lessons/a2/day-01.html'), output);
  assert.match(instrumentHtml(html, 'index.html'), /src="assets\/auth-client.js"/);
  assert.match(instrumentHtml('<html class=lesson><head></head><body></body></html>'), /class="lesson access-pending"/);
  assert.throws(() => instrumentHtml(html, '../outside.html'));
});

test('initial events contain only whitelisted metadata and no awarded time', async () => {
  const app = await harness();
  assert.deepEqual(app.requests[0].events.map((event) => event.type), ['page_view', 'lesson_open', 'activity_view']);
  for (const event of app.requests[0].events) {
    assert.equal(event.lesson, 'lessons/a2/day-01.html');
    assert.equal(event.activeSeconds, 0);
    assert.deepEqual(Object.keys(event).sort(), ['activeSeconds', 'activity', 'context', 'eventId', 'lesson','occurredAt', 'type']);
    assert.ok(!JSON.stringify(event).includes('private'));
  }
});
test('presence follows visibility and recent input without replaying an offline online status',async()=>{
 const app=await harness();assert.equal(app.presenceRequests[0].state,'active');await app.advance(60000);assert.equal(app.presenceRequests.at(-1).state,'idle');await app.emit('pointerdown');assert.equal(app.presenceRequests.at(-1).state,'active');app.document.visibilityState='hidden';await app.emit('visibilitychange');assert.equal(app.presenceRequests.at(-1).state,'hidden');const offline=await harness({offline:true});assert.equal(offline.presenceRequests.length,0);assert.ok(offline.pending().length>0);
});
test('only explicit assessment events capture graded answers and queued extra fields are discarded',async()=>{
 const app=await harness({offline:true});const detail={questionId:'q1',prompt:'Choose a greeting.',selectedAnswer:'Hello',correctAnswer:'Hello',outcome:'correct',assessmentKind:'multiple-choice',password:'NOT FOR LOGS',notes:'PRIVATE NOTE'};
 await app.emit('english:question-result',{detail},'window');const item=app.pending().at(-1);assert.equal(item.type,'question_result');assert.equal(item.details.selectedAnswer,'Hello');assert.equal(item.details.outcome,'correct');assert.ok(!JSON.stringify(item).includes('PRIVATE NOTE'));assert.ok(!JSON.stringify(item).includes('NOT FOR LOGS'));await app.emit('english:question-result',{detail:{...detail,outcome:'made-up'}},'window');assert.equal(app.pending().at(-1).eventId,item.eventId);
});

test('visible time accumulates elapsed seconds and stops at inactivity', async () => {
  const app = await harness();
  await app.advance(75_000);
  const heartbeats = app.requests.flatMap((request) => request.events).filter((event) => event.type === 'heartbeat');
  assert.equal(heartbeats.reduce((sum, event) => sum + event.activeSeconds, 0), 60);
  assert.ok(heartbeats.every((event) => event.activeSeconds <= 30));
  await app.emit('pointerdown');
  await app.advance(15_000);
  const all = app.requests.flatMap((request) => request.events).filter((event) => event.type === 'heartbeat');
  assert.equal(all.reduce((sum, event) => sum + event.activeSeconds, 0), 75);
});

test('hidden tab accrues no time and resume does not fill the gap', async () => {
  const app = await harness();
  await app.advance(2_500);
  app.document.visibilityState = 'hidden';
  await app.emit('visibilitychange');
  await app.advance(30_000);
  app.document.visibilityState = 'visible';
  await app.emit('visibilitychange');
  await app.advance(27_500);
  const heartbeats = app.requests.flatMap((request) => request.events).filter((event) => event.type === 'heartbeat');
  assert.equal(heartbeats.reduce((sum, event) => sum + event.activeSeconds, 0), 30);
});

test('history replacement and board screen changes are observed without text capture', async () => {
  const app = await harness({ offline: true });
  app.context.location.hash = '#2';
  app.document.board = new FakeElement({ id: 'board-jump', value: '12', options: [new FakeElement({value:'12',text:'02 · Tell me more'})] });
  await app.advance(500);
  assert.equal(app.pending().at(-1).activity, 'board-12');
  app.context.location.hash = '#secret=answer&name=PRIVATE';
  await app.advance(500);
  assert.equal(app.pending().at(-1).activity, 'board-12');
  const target = new FakeElement({ 'data-action': 'check', value: 'DO NOT LOG THIS ANSWER' });
  await app.emit('click', { target });
  assert.equal(app.pending().at(-1).type, 'answer_check');
  assert.ok(!JSON.stringify(app.pending()).includes('DO NOT LOG'));
});

test('logout stops all collection and leaves only the original student queue', async () => {
  const app = await harness({ offline: true });
  await app.advance(5_000);
  await app.emit('english:logout', {}, 'window');
  const saved = app.pending();
  app.setSession({ student: { id: 'student-2' }, role: 'student' });
  app.context.navigator.onLine = true;
  await app.emit('online', {}, 'window');
  await app.emit('click', { target: new FakeElement({ 'data-action': 'check' }) });
  await app.advance(15_000);
  assert.deepEqual(app.pending(), saved);
  assert.equal(app.requests.length, 0);
  assert.equal(app.storage.has('en-access-events:student-2'), false);
});

test('offline queue is capped and replays only the matching student', async () => {
  const first = await harness({ id: 'student-a', offline: true });
  for (let index = 0; index < 350; index++) await first.emit('click', { target: new FakeElement({ 'data-action': 'check' }) });
  assert.equal(first.pending().length, 300);
  const savedId = first.pending()[10].eventId;
  const other = await harness({ id: 'student-b', storage: first.storage });
  assert.ok(other.requests.flatMap((request) => request.events).every((event) => event.eventId !== savedId));
  const same = await harness({ id: 'student-a', storage: first.storage });
  assert.equal(same.requests[0].events.length, 10);
  await same.advance(30_000);
  assert.ok(same.requests.flatMap((request) => request.events).some((event) => event.eventId === savedId));
  assert.ok(same.requests.every((request) => request.events.length <= 10));
});

test('untrusted queued extra fields are never replayed', async () => {
  const storage = new Map([['en-access-events:student-1', JSON.stringify([{
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', type: 'answer_check', lesson: 'panel', activity: 'home', activeSeconds: 0,
    password: 'PRIVATE', answer: 'PRIVATE', studentId: 'wrong-student',
  }])]]);
  const app = await harness({ storage });
  assert.ok(!JSON.stringify(app.requests).includes('PRIVATE'));
  assert.ok(!JSON.stringify(app.requests).includes('wrong-student'));
});

const HEADING = '#main .screen-head h1,#main .b-title-row h1,#main .activity-head h1,#workspace .page-head h1,#workspace h1,#main h1';
const TABS = '[role="tab"][aria-selected="true"],.tab-btn.active[data-tab],.tab.active[data-tab]';

test('exact lesson, numeric screen and static internal tab labels are attached without student text', async () => {
  const app = await harness({offline:true,pathname:'/ingilizce-dersler/lessons/b1/day-05.html'});
  app.document.elements.set('screen-select',new FakeElement({id:'screen-select',value:'14',options:[new FakeElement({value:'14',text:'15 · Listening: the landlord'})]}));
  app.document.selectors.set(HEADING,new FakeElement({tagName:'H1',text:'Listening: the landlord'}));
  app.document.selectors.set(TABS,new FakeElement({text:'Dinleme',role:'tab'}));
  app.context.location.hash='#PRIVATE-STUDENT-NOTE';
  await app.advance(500);
  const event=app.pending().at(-1);
  assert.equal(event.type,'activity_view');
  assert.equal(event.activity,'screen-14');
  assert.equal(event.context.pagePath,'lessons/b1/day-05.html');
  assert.equal(event.context.screenTitle,'Listening: the landlord');
  assert.equal(event.context.section,'Dinleme');
  assert.equal(event.context.interaction,'navigation');
  assert.equal(event.context.lastInteractionAt,null);
  assert.ok(!JSON.stringify(event).includes('PRIVATE'));
});

test('screen-select overview -1 and option membership prevent arbitrary selected values from entering logs',async()=>{
  const app=await harness({offline:true});
  const select=new FakeElement({id:'screen-select',value:'-1',options:[new FakeElement({value:'-1',text:'Dersin genel görünümü'})]});
  app.document.elements.set('screen-select',select);await app.advance(500);
  assert.equal(app.pending().at(-1).context.screenId,'screen--1');
  select.value='12000';app.context.location.hash='#PRIVATE';await app.advance(500);
  assert.equal(app.pending().at(-1).context.screenId,'home');
  assert.ok(!JSON.stringify(app.pending()).includes('PRIVATE'));
});

test('YDS unit and topic use rendered controls and exact headings, never arbitrary route text',async()=>{
  const app=await harness({offline:true,pathname:'/ingilizce-dersler/lessons/yds/grammar-studio.html'});
  app.document.selectors.set('#unit-nav a',[new FakeElement({'data-unit':'u05'})]);
  app.document.elements.set('section-select',new FakeElement({id:'section-select',value:'u05-s03',options:[new FakeElement({value:'u05-s03',text:'03 · Whether / if'})]}));
  app.document.selectors.set(HEADING,new FakeElement({text:'Noun clauses and reported speech'}));
  app.context.location.hash='#unit/u05/u05-s03';await app.advance(500);
  const event=app.pending().at(-1);
  assert.equal(event.activity,'unit:u05:u05-s03');assert.equal(event.context.section,'03 · Whether / if');
  assert.equal(event.context.screenTitle,'Noun clauses and reported speech');
  app.document.elements.delete('section-select');app.context.location.hash='#unit/PRIVATE?notes=SECRET';await app.advance(500);
  assert.equal(app.pending().at(-1).activity,'unit');assert.ok(!JSON.stringify(app.pending()).includes('SECRET'));
});

test('main panel level route stays useful without capturing arbitrary hash text',async()=>{
  const app=await harness({offline:true,pathname:'/ingilizce-dersler/index.html',hash:'#B1'});
  assert.equal(app.pending()[0].context.pagePath,'index.html');assert.equal(app.pending()[0].context.screenId,'level-B1');
  app.context.location.hash='#Jane-personal-info';await app.advance(500);
  assert.equal(app.pending().at(-1).activity,'home');assert.ok(!JSON.stringify(app.pending()).includes('Jane'));
});

test('330 seconds without movement emits abandoned exactly once and reports possible left-open',async()=>{
  const app=await harness();await app.advance(329000);
  assert.equal(app.events().filter(event=>event.type==='idle_start').length,1);
  assert.equal(app.events().filter(event=>event.type==='abandoned').length,0);
  assert.equal(app.presenceRequests.at(-1).context.status,'reading');
  await app.advance(1000);
  const abandoned=app.events().filter(event=>event.type==='abandoned');
  assert.equal(abandoned.length,1);assert.equal(abandoned[0].context.idleSeconds,330);
  assert.equal(abandoned[0].context.status,'left_open');assert.equal(abandoned[0].context.visibility,'visible');
  await app.advance(90000);
  assert.equal(app.events().filter(event=>event.type==='abandoned').length,1);
  assert.equal(app.events().filter(event=>event.type==='heartbeat').reduce((sum,event)=>sum+event.activeSeconds,0),60);
  assert.equal(app.presenceRequests.at(-1).context.status,'left_open');
});

test('focus, automatic scrolling and synthetic navigation do not resume an abandoned page',async()=>{
  const app=await harness();await app.advance(330000);
  await app.emit('blur',{},'window');app.document.focused=false;
  app.document.focused=true;await app.emit('focus',{},'window');
  await app.emit('scroll',{isTrusted:true});await app.emit('pointermove',{isTrusted:false});
  app.context.location.hash='#does-not-exist';await app.advance(500);
  assert.equal(app.events().filter(event=>event.type==='resumed').length,0);
  assert.equal(app.presenceRequests.at(-1).context.status,'left_open');
  await app.emit('keydown',{isTrusted:true,key:'PRIVATE KEY',target:new FakeElement({value:'PRIVATE NOTE'})});
  assert.equal(app.events().filter(event=>event.type==='resumed').length,1);
  const context=app.events().find(event=>event.type==='resumed').context;
  assert.equal(context.status,'working');assert.equal(context.idleSeconds,0);assert.equal(context.interaction,'keyboard');
  assert.ok(context.lastInteractionAt);assert.ok(!JSON.stringify(app.events()).includes('PRIVATE'));
  await app.emit('pointerdown',{isTrusted:true});assert.equal(app.events().filter(event=>event.type==='resumed').length,1);
});

test('blur accounts for the preceding focused slice, never credits unfocused time and preserves idle age',async()=>{
  const app=await harness();await app.advance(2500);
  app.document.focused=false;await app.emit('blur',{},'window');
  assert.equal(app.presenceRequests.at(-1).context.status,'unfocused');
  assert.equal(app.presenceRequests.at(-1).context.focused,false);
  await app.advance(30000);app.document.focused=true;await app.emit('focus',{},'window');
  assert.equal(app.presenceRequests.at(-1).context.idleSeconds,32);
  await app.advance(27500);
  const total=app.events().filter(event=>event.type==='heartbeat').reduce((sum,event)=>sum+event.activeSeconds,0);
  assert.equal(total,30);assert.equal(app.events().filter(event=>event.type==='window_blur').length,1);
  assert.equal(app.events().filter(event=>event.type==='window_focus').length,1);
  assert.equal(app.events().filter(event=>event.type==='resumed').length,0);
});

test('hidden tabs send fresh best-effort background presence and age to left-open without active credit',async()=>{
  const app=await harness();await app.advance(2000);
  app.document.visibilityState='hidden';await app.emit('visibilitychange');
  assert.equal(app.presenceRequests.at(-1).context.status,'background');
  const count=app.presenceRequests.length;await app.advance(90000);
  assert.ok(app.presenceRequests.length>=count+3);
  assert.equal(app.presenceRequests.at(-1).context.visibility,'hidden');
  assert.equal(app.presenceRequests.at(-1).context.idleSeconds,90);
  await app.advance(238000);
  assert.equal(app.presenceRequests.at(-1).context.status,'left_open');
  assert.equal(app.events().filter(event=>event.type==='heartbeat').reduce((sum,event)=>sum+event.activeSeconds,0),2);
  assert.equal(app.events().filter(event=>event.type==='abandoned').length,1);
  assert.equal(app.events().filter(event=>event.type==='tab_hidden').length,1);
});

test('a browser freeze cannot inflate credit and a late tick still catches the abandoned threshold',async()=>{
  const app=await harness();await app.advance(2000);await app.jump(360000);
  assert.equal(app.events().filter(event=>event.type==='heartbeat').reduce((sum,event)=>sum+event.activeSeconds,0),2);
  assert.equal(app.events().filter(event=>event.type==='abandoned').length,1);
  assert.equal(app.presenceRequests.at(-1).context.status,'left_open');
});

test('leaving is logged explicitly and page restoration neither credits the gap nor resets last input',async()=>{
  const app=await harness();await app.advance(2500);await app.emit('pagehide',{},'window');
  assert.equal(app.events().filter(event=>event.type==='page_leave').length,1);
  assert.equal(app.events().find(event=>event.type==='page_leave').context.status,'leaving');
  assert.equal(app.presenceRequests.at(-1).state,'hidden');
  await app.advance(330000);await app.emit('pageshow',{},'window');
  assert.equal(app.presenceRequests.at(-1).context.status,'left_open');
  assert.equal(app.events().filter(event=>event.type==='resumed').length,0);
  assert.equal(app.events().filter(event=>event.type==='heartbeat').reduce((sum,event)=>sum+event.activeSeconds,0),2);
});

test('offline transition context is replayed through a strict field whitelist while presence is current only',async()=>{
  const first=await harness({offline:true});await first.advance(330000);
  const saved=first.pending().find(event=>event.type==='abandoned');
  saved.context.password='PRIVATE';saved.context.coordinates=[12,34];saved.context.note='PRIVATE';
  first.storage.set('en-access-events:student-1',JSON.stringify([saved]));
  const second=await harness({storage:first.storage,epoch:first.epoch+330000});await second.settle();
  const replayed=second.events().find(event=>event.eventId===saved.eventId);
  assert.equal(replayed.context.status,'left_open');assert.equal(replayed.context.idleSeconds,330);
  assert.ok(!JSON.stringify(second.events()).includes('PRIVATE'));
  assert.equal(second.presenceRequests[0].context.status,'working');
  assert.equal(second.presenceRequests[0].context.idleSeconds,0);
  assert.deepEqual(Object.keys(replayed.context).sort(),['tabId','pagePath','pageTitle','screenId','screenTitle','section','visibility','focused','idleSeconds','lastInteractionAt','interaction','status'].sort());
});

test('pointer movement is throttled without producing one event per movement or capturing coordinates',async()=>{
  const app=await harness();await app.advance(330000);
  for(let index=0;index<100;index++)await app.emit('pointermove',{isTrusted:true,clientX:123,clientY:456});
  assert.equal(app.events().filter(event=>event.type==='resumed').length,1);
  assert.ok(!JSON.stringify(app.events()).includes('clientX'));
  assert.ok(app.events().length<15);
});


test('pagehide requests use keepalive for both final presence and event batch',async()=>{
  const app=await harness();await app.emit('pagehide',{},'window');
  assert.equal(app.presenceOptions.at(-1).keepalive,true);
  const batch=app.requests.find(request=>request.events.some(event=>event.type==='page_leave'));
  assert.equal(batch.keepalive,true);
});

test('identity replacement without a logout notification cannot append activity to the previous student queue',async()=>{
  const app=await harness({offline:true});const before=app.pending();
  app.setSession({student:{id:'student-2'},role:'student'});
  await app.emit('click',{target:new FakeElement({'data-action':'check'})});
  await app.advance(360000);
  assert.deepEqual(app.pending(),before);assert.equal(app.requests.length,0);
  assert.equal(app.storage.has('en-access-events:student-2'),false);
});

test('the heartbeat at 60 seconds preserves an observed working snapshot before the idle boundary',async()=>{
  const app=await harness();await app.advance(60000);
  const heartbeats=app.events().filter(event=>event.type==='heartbeat');
  assert.equal(heartbeats.reduce((sum,event)=>sum+event.activeSeconds,0),60);
  assert.ok(heartbeats.every(event=>event.context.status==='working'&&event.context.visibility==='visible'&&event.context.focused&&event.context.idleSeconds<60));
  const last=heartbeats.at(-1);
  assert.equal(last.activeSeconds,30);assert.equal(last.context.idleSeconds,59);
  assert.equal(Date.parse(last.occurredAt),app.epoch+59000);
  assert.equal(app.presenceRequests.at(-1).context.status,'reading');
  assert.equal(app.presenceRequests.at(-1).context.idleSeconds,60);
});

test('blur and hidden flushes preserve the preceding working slice rather than the new background state',async()=>{
  for(const transition of ['blur','hidden']) {
    const app=await harness();await app.advance(2500);
    if(transition==='blur'){app.document.focused=false;await app.emit('blur',{},'window');}
    else {app.document.visibilityState='hidden';await app.emit('visibilitychange');}
    const heartbeat=app.events().find(event=>event.type==='heartbeat');
    assert.equal(heartbeat.activeSeconds,2);assert.equal(heartbeat.context.status,'working');
    assert.equal(heartbeat.context.visibility,'visible');assert.equal(heartbeat.context.focused,true);
    assert.equal(Date.parse(heartbeat.occurredAt),app.epoch+2500);
    assert.equal(app.presenceRequests.at(-1).context.status,transition==='blur'?'unfocused':'background');
  }
});

test('expired, malformed and mismatched contextual offline items are discarded without downgrading to legacy credit',async()=>{
  const first=await harness({offline:true});await first.advance(1000);
  const base=first.pending()[0], stamp=new Date(first.epoch).toISOString();
  const make=(index,changes)=>({...base,eventId:`aaaaaaaa-aaaa-4aaa-8aaa-${String(index).padStart(12,'0')}`,type:'heartbeat',activeSeconds:30,occurredAt:stamp,...changes});
  const items=[
    make(1,{occurredAt:new Date(first.epoch-31*86400000).toISOString()}),
    make(2,{occurredAt:'not a date'}),
    make(3,{occurredAt:undefined}),
    make(4,{context:{...base.context,lastInteractionAt:new Date(first.epoch-31*86400000).toISOString()}}),
    make(5,{context:{...base.context,lastInteractionAt:'2026'}}),
    make(6,{context:{...base.context,pagePath:'lessons/b1/day-05.html'}}),
    make(7,{context:null}),
    make(8,{context:{...base.context,focused:'yes'}}),
    make(9,{context:{...base.context,note:'PRIVATE'}}),
  ];
  first.storage.set('en-access-events:student-1',JSON.stringify(items));
  const second=await harness({storage:first.storage,epoch:first.epoch+1000});
  const replayed=second.events().filter(event=>event.eventId.startsWith('aaaaaaaa-'));
  assert.equal(replayed.length,1);assert.equal(replayed[0].eventId,items.at(-1).eventId);
  assert.equal(replayed[0].context.status,'working');assert.ok(!JSON.stringify(replayed).includes('PRIVATE'));
  assert.ok(replayed.every(event=>event.context));
});

test('presence sequence increases per actual payload and final leave bypasses a stalled earlier request',async()=>{
  const app=await harness({holdFirstPresence:true});
  assert.deepEqual(app.presenceRequests.map(payload=>payload.sequence),[1]);
  await app.emit('pointerdown',{isTrusted:true});await app.advance(1000);
  assert.equal(app.presenceRequests.length,1);
  await app.emit('pagehide',{},'window');
  assert.deepEqual(app.presenceRequests.map(payload=>payload.sequence),[1,2]);
  assert.equal(app.presenceRequests[1].context.status,'leaving');assert.equal(app.presenceOptions[1].keepalive,true);
  await app.releasePresence();await app.emit('pageshow',{},'window');
  const sequences=app.presenceRequests.map(payload=>payload.sequence);
  assert.deepEqual(sequences,Array.from({length:sequences.length},(_,index)=>index+1));
  assert.ok(app.presenceRequests.at(-1).sequence>2);assert.equal(app.presenceRequests.at(-1).context.status,'working');
});
