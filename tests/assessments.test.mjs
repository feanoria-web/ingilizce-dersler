import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile, readdir } from 'node:fs/promises';
import { instrumentAssessments } from '../scripts/instrument-assessments.mjs';

const base = new URL('../', import.meta.url);
const bridge = await readFile(new URL('assets/assessment-bridge.js', base), 'utf8');
const lesson = async name => instrumentAssessments(await readFile(new URL('lessons/' + name, base), 'utf8'), 'lessons/' + name).html;
function environment(extras = {}) {
  const events = [], handlers = {};
  const window = { dispatchEvent: event => events.push(event.detail) };
  const context = vm.createContext({ window, CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init.detail; } }, document: { addEventListener: (kind, handler) => { handlers[kind] = handler; } }, ...extras });
  vm.runInContext(bridge, context);
  return { context, events, handlers, api: window.EnglishAssessment };
}
function namedFunction(html, start, end) {
  const a = html.indexOf(start), b = html.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a, 'native function fixture exists');
  return html.slice(a, b);
}
test('every discovered lesson has grading coverage and every published inline script parses', async () => {
  const paths = [];
  for (const group of ['a1', 'a2', 'b1', 'yds']) for (const name of await readdir(new URL('lessons/' + group + '/', base))) if (name.endsWith('.html')) paths.push(group + '/' + name);
  assert.ok(paths.length >= 15, 'the original lessons and all three newly imported lessons are present');
  for (const added of ['a1/day-03.html', 'a2/day-04.html', 'b1/day-05.html']) assert.ok(paths.includes(added), added);
  for (const file of paths) {
    const original = await readFile(new URL('lessons/' + file, base), 'utf8');
    const { html, coverage } = instrumentAssessments(original, 'lessons/' + file);
    assert.ok(coverage.hooks.length >= 2, file);
    assert.equal((html.match(/id="english-assessment-bridge"/g) || []).length, 1);
    assert.ok(html.indexOf('id="english-assessment-bridge"') < html.indexOf('<script', html.indexOf('id="english-assessment-bridge"')));
    assert.equal(instrumentAssessments(html, 'lessons/' + file).html, html);
    for (const [, attributes, js] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/i.test(attributes)) new vm.Script(js, { filename: file });
  }
});
test('actual component data has nonempty, distinct IDs for every matching, sorting and marked-reading activity', async () => {
  let activities = 0;
  for (const group of ['a1', 'a2', 'b1']) {
    for (const name of await readdir(new URL('lessons/' + group + '/', base))) {
      if (!name.endsWith('.html')) continue;
      const html = await readFile(new URL('lessons/' + group + '/' + name, base), 'utf8');
      if (!html.includes('function bindChoice')) continue;
      const dataScript = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].find(([, attributes, script]) => !/application\/(json|ld\+json)/i.test(attributes) && script.includes('const LESSON'));
      assert.ok(dataScript, group + '/' + name);
      const context = vm.createContext({});
      vm.runInContext(dataScript[2], context);
      const data = vm.runInContext('LESSON', context);
      const ids = new Set();
      for (const screen of data.screens) for (const section of screen.sections || []) {
        if (!['match', 'sort', 'reading'].includes(section.type)) continue;
        const label = `${group}/${name} ${screen.id}/${section.type}`;
        assert.equal(typeof section.id, 'string', label);
        assert.ok(section.id.trim(), label);
        assert.ok(!ids.has(section.id), label + ': duplicate component ID');
        ids.add(section.id); activities++;
        // parseMarks generates `${reading.id}.${paragraphIndex}.${wordIndex}`.
        assert.ok((section.id + '.999.999').length <= 160, label + ': event identifier bound');
      }
    }
  }
  assert.ok(activities >= 25, 'all current component activities were inspected');
});
test('bridge validates, bounds, deduplicates and never reads inputs or copies arbitrary fields', () => {
  const { api, events } = environment();
  api.result('q1', 'Question', 'yes', 'yes', true);
  api.result('q1', 'Question', 'yes', 'yes', true);
  api.result('q1', 'Question', 'no', 'yes', false);
  api.result('q1', 'Question', '', 'yes', false);
  api.emit({ questionId: 'self', prompt: 'Confidence', selectedAnswer: 'Ready', correctAnswer: '', outcome: 'ungraded', password: 'NEVER', notes: 'NEVER', assessmentKind: 'self-report' });
  assert.deepEqual(events.map(event => event.outcome), ['correct', 'incorrect', 'blank', 'ungraded']);
  assert.ok(events.every(event => !('password' in event) && !('notes' in event) && event.attemptId));
  api.result('long', 'x'.repeat(1800), 'x'.repeat(1200), 'y'.repeat(1200), false);
  assert.equal(events.at(-1).prompt.length, 1500);
  assert.equal(events.at(-1).selectedAnswer.length, 1000);
  api.reset('q1'); api.result('q1', 'Question', '', 'yes', false);
  assert.equal(events.length, 6);
});
for (const file of ['a2/practice.html', 'b1/practice.html']) {
  test(`${file}: native grader sends correct, wrong and blank; repeated check is suppressed`, async () => {
    const html = await lesson(file);
    const qs = [{ q: 'Choose red', options: ['red', 'blue'], answer: 0 }, { q: 'Choose blue', options: ['red', 'blue'], answer: 1 }, { q: 'Not answered', options: ['red', 'blue'], answer: 0 }];
    const state = { answers: { 'qa-0': '0', 'qa-1': '0', 'qa-2': '' } };
    const { context, events } = environment({ state, $: () => null, norm: x => x, normalize: x => x });
    const source = namedFunction(html, 'function grade(', '\n');
    vm.runInContext(source, context);
    context.grade('qa', qs); context.grade('qa', qs);
    assert.deepEqual(events.map(event => event.outcome), ['correct', 'incorrect', 'blank']);
    assert.equal(events[1].selectedAnswer, 'red'); assert.equal(events[1].correctAnswer, 'blue');
    state.answers['qa-1'] = '1'; context.grade('qa', qs);
    assert.equal(events.length, 4); assert.equal(events.at(-1).outcome, 'correct');
  });
}
test('first-day light diagnostic logs blank and evaluated choices without collecting observations', async () => {
  const html = await lesson('a2/day-01.html');
  const { context, events } = environment({ QUIZZES: { qa: [{ q: 'First', options: ['yes', 'no'], answer: 0 }, { q: 'Second', options: ['yes', 'no'], answer: 1 }, { q: 'Later', options: ['yes', 'no'], answer: 1 }] }, state: { answers: { 'qa-0': 0, 'qa-1': 0 } }, $: () => null });
  vm.runInContext(namedFunction(html, 'function checkLightQuiz(', '\n'), context);
  context.checkLightQuiz('qa'); context.checkLightQuiz('qa');
  assert.deepEqual(events.map(event => event.outcome), ['correct', 'incorrect', 'blank']);
});
test('native YDS timed exam grades every question once, including blanks, and a later exam is a new attempt', async () => {
  const html = await lesson('yds/grammar-studio.html');
  const map = new Map([['a', { id: 'a', prompt: 'A', options: ['yes', 'no'], answer: 0 }], ['b', { id: 'b', prompt: 'B', options: ['yes', 'no'], answer: 1 }], ['c', { id: 'c', prompt: 'C', options: ['yes', 'no'], answer: 0 }]]);
  const exam = () => ({ ids: ['a', 'b', 'c'], choices: { a: 0, b: 0 }, started: 1000 });
  const state = { exam: exam(), answers: {}, wrong: {}, history: [] };
  const { context, events } = environment({ state, QUESTION_MAP: map, examExpired: () => false, save() {}, render() {}, tell() {} });
  vm.runInContext(namedFunction(html, 'function submitExam(', '  function startExam('), context);
  context.submitExam(); context.submitExam();
  assert.deepEqual(events.map(event => event.outcome), ['correct', 'incorrect', 'blank']);
  state.exam = { ...exam(), started: 2000 }; context.submitExam(true);
  assert.equal(events.length, 6); assert.equal(state.exam.expired, true);
});
test('native component matching preserves correct, wrong and blank independently', async () => {
  const html = await lesson('a1/day-01.html');
  const callbacks = {};
  const control = selector => ({ addEventListener: (type, callback) => { callbacks[selector] = callback; }, textContent: '' });
  const { context, events } = environment({ B: {}, st: { sorts: { pairs: { 0: 0, 1: 0 } } }, $: control, $$: () => [], save() {}, toast() {} });
  vm.runInContext(namedFunction(html, 'B.match = ', '  /* listen and type */'), context);
  context.B.match({}, { id: 'pairs', pairs: [['A', 'a'], ['B', 'b'], ['C', 'c']] });
  callbacks['[data-check]'](); callbacks['[data-check]']();
  assert.deepEqual(events.map(event => event.outcome), ['correct', 'incorrect', 'blank']);
  assert.equal(events[1].selectedAnswer, 'a'); assert.equal(events[1].correctAnswer, 'b');
});
test('native immediate choice reports only student clicks, not restored state or answer painting', async () => {
  const html = await lesson('b1/day-02.html');
  const callbacks = new Map(), cls = { add() {}, remove() {} };
  const question = { dataset: { i: '0' }, classList: cls };
  const options = [0, 1].map(j => ({ dataset: { j: String(j) }, classList: cls, closest: () => question, addEventListener: (_, callback) => callbacks.set('option-' + j, callback) }));
  const score = {}, clear = { addEventListener: (_, callback) => callbacks.set('clear', callback) };
  const { context, events, handlers } = environment({ st: { choices: { 'intro.0.0': 0 } }, key: (s, k, i) => `${s.id}.${k}.${i}`, save() {}, $: selector => selector === '[data-score]' ? score : clear, $$: selector => selector === '.q-item' ? [question] : options });
  vm.runInContext(namedFunction(html, 'function bindChoice(', '  /* gap fill */'), context);
  context.bindChoice({}, { items: [{ q: 'Choose yes', a: 0 }], options: ['yes', 'no'] }, { id: 'intro' }, 0, item => item.a);
  assert.equal(events.length, 0);
  callbacks.get('option-1')(); callbacks.get('option-1')(); callbacks.get('option-0')();
  assert.deepEqual(events.map(event => event.outcome), ['incorrect', 'correct']);
  handlers.click({ target: { closest: () => ({}) } }); callbacks.get('clear')(); callbacks.get('option-0')();
  assert.equal(events.length, 3);
});
test('native gap checking sends individual evaluated blanks, not arbitrary text areas', async () => {
  const html = await lesson('a1/day-01.html');
  const callbacks = {}, cls = { add() {}, remove() {}, toggle() {} };
  const questions = ['am', 'wrong', ''].map((value, i) => ({ dataset: { i: String(i) }, classList: cls, input: { value, dataset: { j: '0' }, classList: cls, addEventListener() {}, closest() { return questions[i]; } } }));
  const { context, events } = environment({ B: {}, st: { inputs: {} }, key: (s, k, i, j) => `${s.id}.${k}.${i}.${j}`, save() {}, accepts: (value, expected) => value === expected, $: selector => ({ addEventListener: (_, callback) => callbacks[selector] = callback }), $$: (selector, parent) => selector === '.q-item' ? questions : parent?.input ? [parent.input] : questions.map(q => q.input) });
  vm.runInContext(namedFunction(html, 'B.gap = ', '  /* fix the sentence'), context);
  context.B.gap({}, { items: questions.map(() => ({ q: 'I ___ here.', a: ['am'] })) }, { id: 'gap' }, 0);
  callbacks['[data-check]'](); callbacks['[data-check]']();
  assert.deepEqual(events.map(event => event.outcome), ['correct', 'incorrect', 'blank']);
  assert.equal(events[0].questionId, 'gap.0.0.0');
});
test('native YDS practice guard and retry produce one result per actual attempt', async () => {
  const html = await lesson('yds/grammar-studio.html');
  const q = { id: 'q1', prompt: 'Choose yes', options: ['yes', 'no'], answer: 0 };
  const state = { answers: { q1: { choice: 1 } }, wrong: {} };
  const { context, events } = environment({ state, QUESTION_MAP: new Map([['q1', q]]), button: { dataset: { question: 'q1' } }, save() {}, render() {}, tell() {}, document: { addEventListener() {}, getElementById: () => null } });
  const block = namedFunction(html, "if (action==='grade')", "    if(action==='read')");
  vm.runInContext('function nativeClick(action){' + block + '}', context);
  context.nativeClick('grade'); context.nativeClick('grade');
  assert.equal(events.length, 1); assert.equal(events[0].outcome, 'incorrect');
  context.nativeClick('retry'); state.answers.q1.choice = 0; context.nativeClick('grade');
  assert.equal(events.length, 2); assert.equal(events[1].outcome, 'correct');
});
test('board only evaluates selected answers when shown; hiding/reopening does not invent attempts', async () => {
  const html = await lesson('a2/day-01.html');
  const { context, events } = environment({ boardSlides: [{ uid: 'slide-1', type: 'quiz', question: { q: 'Choose yes', options: ['yes', 'no'], answer: 0 } }], boardIndex: 0, boardVotes: {}, boardReveals: {}, $$: () => [{}], applyBoardReveal() {} });
  vm.runInContext(namedFunction(html, 'function revealBoard(', '\n'), context);
  context.revealBoard(); assert.equal(events.length, 0);
  context.boardVotes['slide-1'] = 1; context.revealBoard(); assert.equal(events.length, 0); // Hide.
  context.revealBoard(); context.revealBoard(); context.revealBoard();
  assert.equal(events.length, 1); assert.equal(events[0].outcome, 'incorrect');
});
