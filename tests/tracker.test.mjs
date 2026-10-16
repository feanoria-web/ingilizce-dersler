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

async function harness({ id = 'student-1', storage = new Map(), offline = false } = {}) {
  const docListeners = new Map();
  const winListeners = new Map();
  const intervals = new Map();
  const requests = [];
  let now = 0;
  let nextTimer = 0;
  let uuid = 0;
  let current = { student: { id }, role: 'student' };
  const on = (listeners, kind, callback) => listeners.set(kind, [...(listeners.get(kind) || []), callback]);
  const document = {
    visibilityState: 'visible', board: null,
    addEventListener: (kind, callback) => on(docListeners, kind, callback),
    getElementById: (key) => key === 'board-jump' ? document.board : null,
    querySelector: () => null,
  };
  const window = {
    addEventListener: (kind, callback) => on(winListeners, kind, callback),
    EnglishAccess: {
      ready: Promise.resolve(current),
      session: () => current,
      request: async (url, options) => {
        assert.equal(options.headers['Content-Type'], 'application/json');
        requests.push({ url, ...JSON.parse(options.body) });
        return { accepted: JSON.parse(options.body).events.length };
      },
    },
  };
  const context = {
    window, document, location: { pathname: '/ingilizce-dersler/lessons/a2/day-01.html', hash: '#1', search: '?private=secret' },
    navigator: { onLine: !offline }, performance: { now: () => now }, Element: FakeElement,
    crypto: { randomUUID: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, '0')}` },
    localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) },
    setInterval: (callback, ms) => { const key = ++nextTimer; intervals.set(key, { callback, ms }); return key; },
    clearInterval: (key) => intervals.delete(key),
  };
  vm.runInNewContext(tracker, context);
  const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  await settle();
  return {
    context, storage, requests, document, settle,
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
      for (const callback of (target === 'window' ? winListeners : docListeners).get(kind) || []) callback(event);
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
    assert.deepEqual(Object.keys(event).sort(), ['activeSeconds', 'activity', 'eventId', 'lesson', 'type']);
    assert.ok(!JSON.stringify(event).includes('private'));
  }
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
  app.document.board = new FakeElement({ value: '12' });
  await app.advance(500);
  assert.equal(app.pending().at(-1).activity, '2:screen-12');
  app.context.location.hash = '#secret=answer&name=PRIVATE';
  await app.advance(500);
  assert.equal(app.pending().at(-1).activity, 'home:screen-12');
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
