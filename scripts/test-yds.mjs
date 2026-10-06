import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import { loadContent } from './build-yds.mjs';

// Run the unmodified application in isolated contexts. This fixture models only
// the DOM, events, clock and storage used by the state/timer flows below; browser
// layout, native controls and accessibility remain separate browser checks.
const content = await loadContent();
const source = await fs.readFile(new URL('../yds-src/app.js', import.meta.url), 'utf8');
const app = new vm.Script(source, { filename: 'yds-src/app.js' });
const storageKey = 'hudavendigar-yds-grammar-studio-v1';
const questions = content.units.flatMap(unit => [...unit.questions, ...unit.reading.questions]);
const questionMap = new Map(questions.map(question => [question.id, question]));
const [correctQuestion, wrongQuestion, blankQuestion, otherQuestion] = content.units[0].questions;
const started = Date.UTC(2026, 9, 7, 9, 0, 0);
const deadline = started + 60_000;

function runningState() {
  return {
    answers: { [correctQuestion.id]: { attempts: 2 } },
    wrong: { [correctQuestion.id]: true, [otherQuestion.id]: true },
    history: [],
    exam: {
      ids: [correctQuestion.id, wrongQuestion.id, blankQuestion.id],
      choices: {
        [correctQuestion.id]: correctQuestion.answer,
        [wrongQuestion.id]: (wrongQuestion.answer + 1) % 5,
      },
      index: 0,
      started,
      minutes: 1,
      submitted: false,
    },
  };
}

function fixture({ state, now = started, hash = '#test', failRead = false, failWrite = false } = {}) {
  let clock = now;
  let saveAttempts = 0;
  const stored = new Map(state === undefined ? [] : [[storageKey, JSON.stringify(state)]]);
  const nodes = new Map();
  const dynamicIds = new Set();
  const documentEvents = new Map();
  const windowEvents = new Map();
  const intervals = [];
  const timeouts = new Map();
  let timeoutId = 0;
  let document;

  function listen(events, type, callback) {
    const callbacks = events.get(type) || [];
    callbacks.push(callback);
    events.set(type, callbacks);
  }

  function emit(events, type, event = {}) {
    for (const callback of events.get(type) || []) callback(event);
  }

  function element(id = '', dataset = {}) {
    const attributes = new Map(id ? [['id', id]] : []);
    const classes = new Set();
    let html = '';
    return {
      id,
      dataset,
      textContent: '',
      disabled: false,
      inert: false,
      classList: {
        add(...names) { names.forEach(name => classes.add(name)); },
        remove(...names) { names.forEach(name => classes.delete(name)); },
        contains(name) { return classes.has(name); },
        toggle(name, force) {
          const add = force === undefined ? !classes.has(name) : Boolean(force);
          add ? classes.add(name) : classes.delete(name);
          return add;
        },
      },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); },
      closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; },
      focus() { document.activeElement = this; },
      scrollIntoView() {},
      get innerHTML() { return html; },
      set innerHTML(value) {
        html = String(value);
        if (id !== 'workspace') return;
        for (const oldId of dynamicIds) nodes.delete(oldId);
        dynamicIds.clear();
        for (const match of html.matchAll(/\bid="([^"]+)"/g)) {
          const child = element(match[1]);
          nodes.set(match[1], child);
          dynamicIds.add(match[1]);
        }
        const timerText = html.match(/\bid="test-timer"[^>]*>([^<]*)</)?.[1];
        if (timerText !== undefined) nodes.get('test-timer').textContent = timerText;
      },
    };
  }

  for (const id of ['study-data', 'workspace', 'save-indicator', 'toast', 'menu-button', 'font-button', 'mistake-badge', 'unit-nav']) {
    nodes.set(id, element(id));
  }
  nodes.get('study-data').textContent = JSON.stringify(content);
  document = {
    body: element('body'),
    activeElement: null,
    getElementById(id) { return nodes.get(id) || null; },
    querySelector(selector) {
      const id = /^#([\w-]+)$/.exec(selector)?.[1];
      return id ? nodes.get(id) || null : null;
    },
    querySelectorAll() { return []; },
    addEventListener(type, callback) { listen(documentEvents, type, callback); },
  };
  const location = { hash };
  const localStorage = {
    getItem(key) {
      if (failRead) throw new Error('Storage reads are unavailable');
      return stored.get(key) ?? null;
    },
    setItem(key, value) {
      saveAttempts++;
      if (failWrite) throw new Error('Storage writes are unavailable');
      stored.set(key, String(value));
    },
  };
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [clock])); }
    static now() { return clock; }
  }
  const media = { matches: false, addEventListener() {} };
  const window = {
    addEventListener(type, callback) { listen(windowEvents, type, callback); },
    scrollTo() {},
    print() {},
  };
  app.runInNewContext({
    document,
    window,
    location,
    localStorage,
    Date: ClockDate,
    console,
    matchMedia: () => media,
    setInterval(callback, delay) { intervals.push({ callback, delay }); return intervals.length; },
    clearInterval() {},
    setTimeout(callback) { const id = ++timeoutId; timeouts.set(id, callback); return id; },
    clearTimeout(id) { timeouts.delete(id); },
  }, { timeout: 5000 });

  return {
    node(id) { return nodes.get(id) || null; },
    get html() { return nodes.get('workspace').innerHTML; },
    get saveAttempts() { return saveAttempts; },
    get storedEntries() { return stored.size; },
    saved() {
      assert.ok(stored.has(storageKey), 'The application must save its state');
      return JSON.parse(stored.get(storageKey));
    },
    advanceTo(value) { assert.ok(value >= clock, 'The clock must not move backwards'); clock = value; },
    tick() {
      assert.ok(intervals.length > 0, 'The application must register its timer');
      for (const { callback } of intervals) callback();
    },
    click(action, dataset = {}) {
      emit(documentEvents, 'click', { target: element('', { action, ...dataset }) });
    },
    change(kind, value) {
      const input = element('', { change: kind });
      input.value = String(value);
      emit(documentEvents, 'change', { target: input });
    },
    submitTest() {
      assert.ok(nodes.has('test-form'), 'The test setup must be rendered before submitting');
      let prevented = false;
      emit(documentEvents, 'submit', { target: nodes.get('test-form'), preventDefault() { prevented = true; } });
      assert.ok(prevented, 'The application must handle the test form without navigation');
    },
    navigate(nextHash) { location.hash = nextHash; emit(windowEvents, 'hashchange'); },
  };
}

function assertGraded(harness, finished) {
  const state = harness.saved();
  assert.equal(state.exam.submitted, true, 'Expired tests must be submitted');
  assert.equal(state.exam.expired, true, 'Expiry must be recorded distinctly from manual submission');
  assert.equal(state.exam.finished, finished);
  assert.equal(state.history.length, 1, 'Expiry must create exactly one history entry');
  assert.deepEqual(state.history[0], { finished, count: 3, correct: 1 });
  assert.deepEqual(state.answers[correctQuestion.id], { choice: correctQuestion.answer, checked: true, attempts: 3 });
  assert.deepEqual(state.answers[wrongQuestion.id], { choice: (wrongQuestion.answer + 1) % 5, checked: true, attempts: 1 });
  assert.deepEqual(state.answers[blankQuestion.id], { checked: true, attempts: 1 }, 'A blank answer must remain blank, not become option A');
  assert.equal(state.wrong[correctQuestion.id], undefined, 'A correct answer must remove an earlier wrong flag');
  assert.equal(state.wrong[wrongQuestion.id], true);
  assert.equal(state.wrong[blankQuestion.id], true, 'Unanswered questions must enter the wrong notebook');
  assert.equal(state.wrong[otherQuestion.id], true, 'Unrelated notebook entries must be retained');
  assert.ok(harness.html.includes('Sonuçlarını birlikte incele.'), 'The result view must be rendered');
  assert.ok(harness.html.includes('Süre doldu; kaydedilen cevaplar değerlendirildi.'), 'The result must explain expiry');
  assert.ok(/<strong>1 \/ 3<\/strong><span>DOĞRU CEVAP/.test(harness.html), 'The result must show one correct answer');
  assert.ok(/<strong>1 \/ 1<\/strong><span>YANLIŞ \/ BOŞ/.test(harness.html), 'The result must distinguish one wrong answer and one blank');
  assert.ok(harness.html.includes('Boş bırakıldı'), 'Blank feedback must be visible');
  assert.equal(harness.node('test-timer'), null, 'The active timer must disappear after submission');
  return state;
}

const tests = [
  ['restored test stays running one millisecond before its deadline', () => {
    const harness = fixture({ state: runningState(), now: deadline - 1 });
    harness.tick();
    const state = harness.saved();
    assert.equal(state.exam.submitted, false);
    assert.equal(state.history.length, 0);
    assert.equal(state.answers[blankQuestion.id], undefined);
    assert.equal(harness.node('test-timer').textContent, '00:01');
    assert.ok(harness.html.includes('Testi bitir ve değerlendir'));
  }],
  ['timer grades correct, wrong and blank answers exactly at the deadline', () => {
    const harness = fixture({ state: runningState(), now: deadline - 1 });
    harness.advanceTo(deadline);
    harness.tick();
    assertGraded(harness, deadline);
    harness.navigate('#mistakes');
    assert.ok(harness.html.includes(`id="question-${blankQuestion.id}"`));
    assert.ok(harness.html.includes(`id="question-${wrongQuestion.id}"`));
    assert.ok(!harness.html.includes(`id="question-${correctQuestion.id}"`));
  }],
  ['repeated callbacks and reload never duplicate history or attempts', () => {
    const harness = fixture({ state: runningState(), now: deadline - 1 });
    harness.advanceTo(deadline);
    harness.tick();
    const graded = assertGraded(harness, deadline);
    for (const time of [deadline + 1000, deadline + 20_000]) {
      harness.advanceTo(time);
      harness.tick();
      assert.deepEqual(harness.saved(), graded);
    }
    const restored = fixture({ state: graded, now: deadline + 30_000 });
    restored.tick();
    assert.deepEqual(restored.saved(), graded);
    assertGraded(restored, deadline);
  }],
  ['restoring at or after the deadline immediately renders graded results', () => {
    for (const now of [deadline, deadline + 30_000]) {
      const harness = fixture({ state: runningState(), now });
      assertGraded(harness, now);
      harness.tick();
      assert.equal(harness.saved().history.length, 1);
    }
  }],
  ['late answer click before the first timer callback cannot change the score', () => {
    const harness = fixture({ state: runningState(), now: deadline - 1 });
    harness.advanceTo(deadline);
    harness.click('choose', { question: correctQuestion.id, index: String((correctQuestion.answer + 1) % 5), exam: 'true' });
    assertGraded(harness, deadline);
    assert.equal(harness.saved().exam.choices[correctQuestion.id], correctQuestion.answer);
  }],
  ['manual finish at the deadline is recorded as expiry', () => {
    const harness = fixture({ state: runningState(), now: deadline - 1 });
    harness.advanceTo(deadline);
    harness.click('test-finish');
    assertGraded(harness, deadline);
  }],
  ['unavailable storage still permits starting, answering and grading a test', () => {
    const harness = fixture({ failRead: true, failWrite: true, now: started });
    assert.ok(harness.html.includes('Kendi testini hazırla.'));
    assert.equal(harness.node('save-indicator').innerHTML, 'Kayıt kullanılamıyor');
    harness.change('test-count', 10);
    harness.change('test-minutes', 15);
    harness.submitTest();
    const id = harness.html.match(/\bid="question-([^"]+)"/)?.[1];
    assert.ok(questionMap.has(id), 'The rendered test must use a real content question');
    harness.click('choose', { question: id, index: String(questionMap.get(id).answer), exam: 'true' });
    harness.advanceTo(started + 15 * 60_000);
    harness.tick();
    assert.ok(/<strong>1 \/ 10<\/strong><span>DOĞRU CEVAP/.test(harness.html));
    assert.ok(/<strong>0 \/ 9<\/strong><span>YANLIŞ \/ BOŞ/.test(harness.html));
    assert.equal(harness.node('mistake-badge').textContent, 9);
    assert.ok(harness.saveAttempts >= 4, 'Save failures must be caught throughout the flow');
    assert.equal(harness.storedEntries, 0, 'The unavailable store must not silently persist data');
    harness.tick();
    harness.navigate('#home');
    assert.ok(/<strong>1<\/strong><span>tamamlanan test/.test(harness.html), 'An in-memory result must remain available');
    harness.navigate('#test');
    assert.ok(harness.html.includes('Sonuçlarını birlikte incele.'));
  }],
  ['write failure while restoring a running test does not prevent expiry results', () => {
    const harness = fixture({ state: runningState(), now: deadline - 1, failWrite: true });
    harness.advanceTo(deadline);
    harness.tick();
    assert.ok(harness.html.includes('Sonuçlarını birlikte incele.'));
    assert.ok(/<strong>1 \/ 3<\/strong><span>DOĞRU CEVAP/.test(harness.html));
    assert.ok(/<strong>1 \/ 1<\/strong><span>YANLIŞ \/ BOŞ/.test(harness.html));
    assert.equal(harness.node('save-indicator').innerHTML, 'Kayıt kullanılamıyor');
    assert.equal(harness.node('mistake-badge').textContent, 3);
    assert.equal(harness.saved().exam.submitted, false, 'Failed writes must leave the stored snapshot unchanged');
    harness.tick();
    harness.navigate('#home');
    assert.ok(/<strong>1<\/strong><span>tamamlanan test/.test(harness.html));
  }],
];

let failures = 0;
for (const [name, run] of tests) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures++;
    console.error(`FAIL ${name}: ${error.message}`);
  }
}
console.log(`YDS state/timer: ${tests.length - failures}/${tests.length} passed; ${content.summary.questions} real questions loaded.`);
if (failures) process.exitCode = 1;
