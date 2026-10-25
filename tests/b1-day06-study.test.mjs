import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { instrumentB1Study, readStudyLesson, loadStudy, validateStudy, studyWordCount, STUDY_LESSONS } from '../scripts/b1-study.mjs';
import { instrumentAssessments } from '../scripts/instrument-assessments.mjs';
import { instrumentBreakReview } from '../scripts/inject-break-review.mjs';
import { instrumentLearning } from '../scripts/instrument-learning.mjs';
import { assertPublicLessonHtml } from '../scripts/extract-teacher-guides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LESSON = 'lessons/b1/day-06.html';
const config = STUDY_LESSONS[LESSON];
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const blocks = await Promise.all([1, 2, 3, 4].map(async n => JSON.parse(await fs.readFile(path.join(ROOT, 'b1-study-06', `block-${n}.json`), 'utf8'))));
const runtime = await fs.readFile(path.join(ROOT, 'assets/b1-study.js'), 'utf8');
const renderer = data => { const window = {}; vm.runInNewContext(runtime, { window, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) } }); return window.EnglishB1Study; };

test('the four-day B1 lesson covers the 26 October – 2 November outcomes', () => {
  assert.equal(lesson.meta.level, 'B1');
  const ids = lesson.screens.map(screen => screen.id);
  for (const id of ['phone-calls', 'arrangements', 'describe-places', 'describe-events', 'explain-device', 'train', 'restaurant-pool', 'opinions', 'school-talk', 'interview', 'notes', 'ask-seller', 'compare', 'labels', 'shopping-ways', 'advice', 'forum']) assert.ok(ids.includes(id), id);
  const text = JSON.stringify(lesson);
  for (const phrase of ['Hi, it\'s me', 'the café where we always meet', 'I was waiting for the bus when it started to rain.', 'To make a copy, press the green button.', 'delayed by approximately twenty-five minutes', 'The main reason is that', 'violence at school', 'I\'m writing to let you know that', 'Does it come with a guarantee?', 'better value', 'Use by', 'pay in instalments', 'If I were you']) assert.ok(text.includes(phrase), phrase);
  for (const block of [1, 2, 3, 4]) assert.equal(lesson.screens.filter(screen => screen.block === block && !screen.extra && screen.type !== 'break').reduce((sum, screen) => sum + screen.min, 0), 100, `block ${block}`);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'b1/day-06'));
});

test('every non-game teaching screen and every phrase-bank item has detailed B1 teaching material', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const teaching = lesson.screens.filter(screen => screen.block > 0 && screen.type !== 'break' && !screen.extra).map(screen => screen.id);
  assert.deepEqual(data.chapters.map(chapter => chapter.screenId).sort(), [...teaching].sort());
  assert.deepEqual(data.blocks, [1, 2, 3, 4]);
  assert.equal(data.stats.sourceTerms, 94);
  assert.ok(data.stats.wordCount >= 40000, `${data.stats.wordCount} words`);
  for (const block of blocks) assert.ok(studyWordCount(block) >= 8000, `Block ${block.block} needs detailed explanations`);
  for (const chapter of data.chapters) {
    assert.ok(chapter.patterns.length >= 2, chapter.screenId);
    assert.ok(chapter.sentenceNotes?.length >= 5, `${chapter.screenId}: lesson sentences explained one by one`);
    for (const note of chapter.sentenceNotes) assert.ok(note.en && note.tr && note.why?.length, `${chapter.screenId}: sentence note`);
    for (const pattern of chapter.patterns) {
      assert.ok(pattern.checks?.length && pattern.mistakes?.length, `${chapter.screenId}/${pattern.id}: own practice`);
      assert.ok(pattern.summary.length >= 3, `${chapter.screenId}/${pattern.id}: concise summary`);
      for (const example of pattern.examples) assert.ok(example.tr && example.why?.length, `${chapter.screenId}: English needs Turkish explanation`);
    }
  }
});

test('the guide is added at publication without changing lesson data, grading coverage or the previous B1 lesson', async () => {
  const expanded = await instrumentB1Study(source, LESSON, ROOT);
  assert.ok(expanded.includes('id="english-b1-study-data"'));
  assert.deepEqual(readStudyLesson(expanded), lesson);
  assert.deepEqual(instrumentAssessments(expanded, LESSON).coverage, instrumentAssessments(source, LESSON).coverage);
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(expanded, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
  assert.equal(await instrumentB1Study(expanded, LESSON, ROOT), expanded);
  const previous = await fs.readFile(path.join(ROOT, 'lessons/b1/day-05.html'), 'utf8');
  const previousGuide = await instrumentB1Study(previous, 'lessons/b1/day-05.html', ROOT);
  assert.ok(previousGuide.includes('on the one hand'), 'the B1 day-05 guide keeps its own material');
  assert.ok(!previousGuide.includes('worth the money, taksit'), 'the two B1 guides stay separate');
});

test('the renderer shows four B1 sections, sentence notes and the B1 day-06 search hint', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const study = renderer(data);
  const home = study.render('home');
  for (const block of [1, 2, 3, 4]) assert.ok(home.includes(`<h3>${block}. bölüm</h3>`), `block ${block}`);
  assert.ok(study.render('vocab').includes('calling about, where, worth the money'));
  assert.ok(study.render('labels').includes('best before'));
  assert.ok(study.render('phone-calls').includes('Dersteki cümleleri tek tek çözelim'));
  assert.equal(study.render('linker-race'), '', 'game screens keep their own activity only');
});

test('a missing chapter or phrase-bank item stops publication', () => {
  const missingChapter = structuredClone(blocks);
  missingChapter[3].chapters.pop();
  assert.throws(() => validateStudy(missingChapter, lesson, config), /B1 ayrıntılı anlatım: bütün ders ekranları/);
  const missingTerm = structuredClone(blocks);
  for (const block of missingTerm) for (const word of block.glossary) word.sourceTerms = word.sourceTerms.filter(term => term !== 'pay in instalments');
  assert.throws(() => validateStudy(missingTerm, lesson, config), /açıklaması eksik kelimeler: pay in instalments/);
});
