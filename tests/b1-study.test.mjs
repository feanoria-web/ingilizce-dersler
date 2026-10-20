import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { instrumentB1Study, readStudyLesson, loadStudy, studyWordCount, validateStudy, applyConciseStudy, serializeStudy, STUDY_LESSON } from '../scripts/b1-study.mjs';
import { instrumentAssessments } from '../scripts/instrument-assessments.mjs';
import { instrumentBreakReview } from '../scripts/inject-break-review.mjs';
import { instrumentLearning } from '../scripts/instrument-learning.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = await fs.readFile(path.join(ROOT, STUDY_LESSON), 'utf8');
const lesson = readStudyLesson(source);
const blocks = await Promise.all([1, 2, 3].map(async n => JSON.parse(await fs.readFile(path.join(ROOT, 'b1-study', `block-${n}.json`), 'utf8'))));
const runtime = await fs.readFile(path.join(ROOT, 'assets/b1-study.js'), 'utf8');
function renderer(data) {
  const window = {};
  vm.runInNewContext(runtime, { window, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) } });
  return window.EnglishB1Study;
}

function visibleText(html) {
  const stack = [], text = [];
  for (const token of html.match(/<[^>]*>|[^<]+/g) || []) {
    if (/^<details\b/i.test(token)) stack.push({ open: /\sopen(?:\s|>)/.test(token), summary: false });
    else if (/^<\/details/i.test(token)) stack.pop();
    else if (/^<summary\b/i.test(token) && stack.length) stack.at(-1).summary = true;
    else if (/^<\/summary/i.test(token) && stack.length) stack.at(-1).summary = false;
    else if (!token.startsWith('<') && stack.every(item => item.open || item.summary)) text.push(token);
  }
  return text.join(' ').replace(/&(?:amp|quot|lt|gt|#39);/g, entity => ({ '&amp;': '&', '&quot;': '"', '&lt;': '<', '&gt;': '>', '&#39;': "'" })[entity]).replace(/\s+/g, ' ').trim();
}

test('every teaching screen and every original vocabulary item has substantial bilingual teaching material', async () => {
  const data = await loadStudy(ROOT, lesson);
  assert.equal(data.chapters.length, 21);
  assert.equal(data.stats.sourceTerms, 87);
  assert.ok(data.stats.wordCount >= 18000, `${data.stats.wordCount} words`);
  for (const block of blocks) assert.ok(studyWordCount(block) >= 5000, `Block ${block.block} needs detailed explanations`);
  for (const chapter of data.chapters) {
    assert.ok(chapter.patterns.length >= 2, chapter.screenId);
    for (const pattern of chapter.patterns) {
      assert.ok(pattern.checks?.length, `${chapter.screenId}/${pattern.id}: own practice`);
      for (const example of pattern.examples) assert.ok(example.tr && example.why?.length, `${chapter.screenId}: English needs Turkish explanation`);
    }
  }
  const living = data.chapters.find(chapter => chapter.screenId === 'living');
  const balance = living.patterns.find(pattern => /on the one hand/i.test(pattern.title));
  assert.ok(balance, 'The specifically requested pattern is a dedicated topic');
  assert.ok(studyWordCount(balance) >= 1200, `One hand / other hand: ${studyWordCount(balance)} words`);
  assert.ok(balance.examples.length >= 12);
  const content = JSON.stringify(balance);
  for (const comparison of ['however', 'although', 'contrary']) assert.ok(content.toLowerCase().includes(comparison));
});

test('the supplement preserves original lesson questions, screen IDs, grading coverage, breaks and learning metadata', async () => {
  const expanded = await instrumentB1Study(source, STUDY_LESSON, ROOT);
  assert.deepEqual(readStudyLesson(expanded), lesson);
  assert.deepEqual(instrumentAssessments(expanded, STUDY_LESSON).coverage, instrumentAssessments(source, STUDY_LESSON).coverage);
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(expanded, STUDY_LESSON).html, STUDY_LESSON), STUDY_LESSON);
  for (const [, attrs, script] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/application\/(json|ld\+json)/i.test(attrs) && script.trim()) new vm.Script(script);
  }
  assert.match(published, /EnglishLearningPageBridge\?\.registerComponent/);
  assert.match(published, /english-break-review/);
  assert.equal(await instrumentB1Study(expanded, STUDY_LESSON, ROOT), expanded);
  assert.equal(await instrumentB1Study(source, 'lessons/b1/day-04.html', ROOT), source);
  const lf = source.replace(/\r\n/g, '\n');
  assert.deepEqual(readStudyLesson(await instrumentB1Study(lf, STUDY_LESSON, ROOT)), lesson);
});

test('the renderer escapes teaching text and keeps practice answers closed until requested', async () => {
  const data = await loadStudy(ROOT, lesson);
  data.chapters[0].intro.push('<img src=x onerror="alert(1)"> & learner');
  const api = renderer(data);
  const html = api.render(data.chapters[0].screenId);
  assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; learner'));
  assert.ok(!html.includes('<img src=x'));
  assert.match(html, /<details data-b1-help="answer"><summary>/);
  assert.ok(!/<details[^>]*\sopen(?:\s|>)/.test(html));
  assert.ok(!html.includes('class="q-item"'));
  assert.match(html, /lang="en"/);
  assert.match(html, /data-b1-say=/);
  assert.equal(api.render('break1'), '');
  assert.match(api.render('home'), /Acele etmeden öğrenelim/);
  assert.match(api.render('vocab'), /type="search"/);
});

test('inline study data cannot close its script element or alter the text it contains', () => {
  const value = { text: '</script><img src=x onerror="alert(1)"> $& $1 \u2028 \u2029 Türkçe' };
  const serialized = serializeStudy(value);
  assert.ok(!serialized.includes('<'));
  assert.ok(!serialized.includes('\u2028'));
  assert.ok(!serialized.includes('\u2029'));
  assert.deepEqual(JSON.parse(serialized), value);
});

test('concise previews cover all patterns without replacing any original teaching material', async () => {
  const base = validateStudy(blocks, lesson);
  const concise = JSON.parse(await fs.readFile(path.join(ROOT, 'b1-study/concise.json'), 'utf8'));
  const data = applyConciseStudy(base, concise);
  assert.equal(data.chapters.length, 21);
  assert.equal(data.chapters.reduce((n, chapter) => n + chapter.patterns.length, 0), 63);
  for (const chapter of data.chapters) {
    assert.ok(studyWordCount(chapter.shortIntro) <= 80, `${chapter.screenId}: brief introduction`);
    for (const pattern of chapter.patterns) assert.ok(studyWordCount(pattern.summary) <= 130, `${pattern.id}: a readable summary`);
  }
  const restored = { ...data, chapters: data.chapters.map(({ shortIntro, ...chapter }) => ({ ...chapter, patterns: chapter.patterns.map(({ summary, exampleIndex, ...pattern }) => pattern) })) };
  assert.deepEqual(restored, base, 'Long explanations, examples, mistakes, sentence notes and glossary must remain intact');
  const invalid = structuredClone(concise);
  invalid.chapters[0].patterns[0].exampleIndex = 9999;
  assert.throws(() => applyConciseStudy(base, invalid), /örnek seçimi geçersiz/);
});

test('opening summaries gives a visibly shorter lesson while long text and answers stay separately expandable', async () => {
  const data = await loadStudy(ROOT, lesson);
  const html = renderer(data).render('living');
  const opened = html.replace(/(<details\b[^>]*\bdata-b1-topic)(?=[\s>])/g, '$1 open');
  const visible = visibleText(opened);
  const chapter = data.chapters.find(item => item.screenId === 'living');
  assert.ok(visible.split(/\s+/).length < 1300, 'All four concise previews must stay scannable');
  assert.ok(visible.split(/\s+/).length < studyWordCount(chapter) * 0.35, 'The initial reading must be substantially shorter');
  for (const pattern of chapter.patterns) {
    assert.ok(visible.includes(pattern.summary[0]));
    assert.ok(!visible.includes(pattern.explanation[0]), 'Full explanation stays behind its own toggle');
  }
  assert.ok(visible.includes('Detayları aç: anlam ve cümle yapısı'));
  assert.ok(!visible.includes('Hayır, değerlendirme yönünü temsil eder.'));
  assert.match(html, /class="b1sg-more/);
  assert.match(html, /class="b1sg-sentence"/);
  assert.ok(visibleText(html.replace(/<details\b/g, '<details open')).includes(chapter.patterns[2].explanation.at(-1)));
});

test('open summaries does not open long explanations or answers, and close all resets every guide toggle', async () => {
  const data = await loadStudy(ROOT, lesson), events = new Map();
  const summaries = [{ open: false }, { open: false }], extras = [{ open: false }, { open: false }];
  const host = { contains: () => true, addEventListener: (type, callback) => events.set(type, callback), querySelectorAll: selector => selector === 'details[data-b1-topic]' ? summaries : selector === 'details' ? [...summaries, ...extras] : [] };
  renderer(data).bind({ querySelector: () => host }, 'living');
  const press = attribute => events.get('click')({ target: { closest: () => ({ hasAttribute: name => name === attribute, dataset: {} }) } });
  press('data-b1-open-all');
  assert.ok(summaries.every(item => item.open));
  assert.ok(extras.every(item => !item.open), 'Neither detail essays nor mini answers open in bulk');
  extras[0].open = true;
  press('data-b1-close-all');
  assert.ok([...summaries, ...extras].every(item => !item.open));
});

test('missing screen and vocabulary coverage fail the publication instead of silently dropping material', () => {
  const missingChapter = structuredClone(blocks);
  missingChapter[0].chapters.pop();
  assert.throws(() => validateStudy(missingChapter, lesson), /bütün ders ekranları/);
  const missingTerm = structuredClone(blocks);
  const term = lesson.vocab[0].items[0][0];
  for (const block of missingTerm) for (const word of block.glossary) word.sourceTerms = word.sourceTerms.filter(sourceTerm => sourceTerm !== term);
  assert.throws(() => validateStudy(missingTerm, lesson), /açıklaması eksik kelimeler/);
});

test('word search keeps pagination bounded, uses Turkish search normalization and records help without submitting answers', async () => {
  const data = await loadStudy(ROOT, lesson);
  const calls = [], said = [], listeners = new Map(), nodes = new Map();
  let nativeHelpCalls = 0;
  let deferred;
  const node = selector => {
    if (!nodes.has(selector)) nodes.set(selector, { value: '', innerHTML: '', textContent: '', disabled: false, addEventListener: (type, callback) => listeners.set(`${selector}:${type}`, callback), scrollIntoView() {} });
    return nodes.get(selector);
  };
  const host = { querySelector: node, querySelectorAll: () => [], contains: () => true, addEventListener: (type, callback) => listeners.set(`host:${type}`, callback) };
  const window = { EnglishAssessment: { help: () => nativeHelpCalls++ }, dispatchEvent: event => calls.push(event.detail) };
  class CustomEvent { constructor(type, options) { this.type = type; this.detail = options.detail; } }
  vm.runInNewContext(runtime, { window, CustomEvent, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) }, setTimeout: callback => { deferred = callback; return 1; }, clearTimeout() {} });
  window.EnglishB1Study.bind({ querySelector: () => host }, 'vocab', { say: text => said.push(text) });
  assert.equal((node('[data-b1-words]').innerHTML.match(/class="b1sg-word"/g) || []).length, 12);
  assert.equal(node('[data-b1-page="prev"]').disabled, true);
  assert.equal(node('[data-b1-page="next"]').disabled, false);
  node('[data-b1-query]').value = 'UNMATCHABLE-987123';
  listeners.get('[data-b1-query]:input')(); deferred();
  assert.match(node('[data-b1-words]').innerHTML, /eşleşen kelime bulunamadı/);
  assert.equal(node('[data-b1-page="next"]').disabled, true);
  node('[data-b1-query]').value = data.glossary[0].term.toLocaleUpperCase('tr');
  listeners.get('[data-b1-query]:input')(); deferred();
  assert.match(node('[data-b1-count]').textContent, /madde bulundu/);
  assert.ok(!node('[data-b1-words]').innerHTML.includes('eşleşen kelime bulunamadı'));
  listeners.get('host:toggle')({ target: { open: true, dataset: { b1Help: 'answer' } } });
  const button = { dataset: { b1Say: 'I live alone.' }, hasAttribute: name => name === 'data-b1-say' };
  listeners.get('host:click')({ target: { closest: () => button } });
  assert.equal(nativeHelpCalls, 0, 'Guide answers must not mark all native questions as helped or revealed');
  assert.deepEqual(calls.map(call => [call.type, call.learning.helpType, call.learning.questionId, call.learning.attemptedBeforeHelp, call.learning.topicId]), [['help_used', 'answer', null, null, 'study:vocab'], ['help_used', 'audio', null, null, 'study:vocab']]);
  assert.deepEqual(said, ['I live alone.']);
  let stopped = false;
  listeners.get('host:keydown')({ key: ' ', stopPropagation() { stopped = true; } });
  assert.equal(stopped, true, 'Space opens native details without revealing old lesson answers');
});
