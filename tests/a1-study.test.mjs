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
const LESSON = 'lessons/a1/day-04.html';
const config = STUDY_LESSONS[LESSON];
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const blocks = await Promise.all([1, 2, 3, 4].map(async n => JSON.parse(await fs.readFile(path.join(ROOT, 'a1-study', `block-${n}.json`), 'utf8'))));
const runtime = await fs.readFile(path.join(ROOT, 'assets/b1-study.js'), 'utf8');
const renderer = data => { const window = {}; vm.runInNewContext(runtime, { window, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) } }); return window.EnglishB1Study; };

test('the A1 lesson covers the curriculum outcomes for school, time and daily routines', () => {
  assert.equal(lesson.meta.level, 'A1');
  const ids = lesson.screens.map(screen => screen.id);
  for (const id of ['commands', 'class-questions', 'instructions', 'signs', 'school-dialogue', 'numbers', 'time', 'past-to', 'time-write', 'routines', 'what-time', 'frequency', 'sequence', 'he-she', 'reading', 'my-day']) assert.ok(ids.includes(id), id);
  const text = JSON.stringify(lesson);
  for (const phrase of ['I always brush my teeth.', 'I often pray.', 'I usually read books.', 'I never lie.', 'quarter to', 'half past', 'twenty-one']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a1/day-04'));
});

test('every non-game teaching screen and every phrase-bank item has detailed Turkish teaching material', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const teaching = lesson.screens.filter(screen => screen.block > 0 && screen.type !== 'break' && !screen.extra).map(screen => screen.id);
  assert.deepEqual(data.chapters.map(chapter => chapter.screenId).sort(), [...teaching].sort());
  assert.deepEqual(data.blocks, [1, 2, 3, 4]);
  assert.equal(data.stats.sourceTerms, 58);
  assert.ok(data.stats.wordCount >= 18000, `${data.stats.wordCount} words`);
  for (const block of blocks) assert.ok(studyWordCount(block) >= 4000, `Block ${block.block} needs detailed explanations`);
  for (const chapter of data.chapters) {
    assert.ok(chapter.patterns.length >= 2, chapter.screenId);
    for (const pattern of chapter.patterns) {
      assert.ok(pattern.checks?.length, `${chapter.screenId}/${pattern.id}: own practice`);
      assert.ok(pattern.summary.length >= 3, `${chapter.screenId}/${pattern.id}: concise summary`);
      for (const example of pattern.examples) assert.ok(example.tr && example.why?.length, `${chapter.screenId}: English needs Turkish explanation`);
    }
  }
});

test('the guide is added at publication without changing lesson data, grading coverage or other lessons', async () => {
  const expanded = await instrumentB1Study(source, LESSON, ROOT);
  assert.ok(expanded.includes('id="english-b1-study-data"'));
  assert.deepEqual(readStudyLesson(expanded), lesson);
  assert.deepEqual(instrumentAssessments(expanded, LESSON).coverage, instrumentAssessments(source, LESSON).coverage);
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(expanded, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
  assert.equal(await instrumentB1Study(expanded, LESSON, ROOT), expanded);
  const other = await fs.readFile(path.join(ROOT, 'lessons/a1/day-03.html'), 'utf8');
  assert.equal(await instrumentB1Study(other, 'lessons/a1/day-03.html', ROOT), other);
});

test('the renderer shows four A1 sections and the A1 search hint', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const study = renderer(data);
  const home = study.render('home');
  for (const block of [1, 2, 3, 4]) assert.ok(home.includes(`<h3>${block}. bölüm</h3>`), `block ${block}`);
  assert.ok(study.render('vocab').includes('half past, get up, always'));
  assert.ok(study.render('past-to').includes('quarter to'));
  assert.equal(study.render('clock-game'), '', 'game screens keep their own activity only');
});

test('a missing chapter or phrase-bank item stops publication', () => {
  const missingChapter = structuredClone(blocks);
  missingChapter[1].chapters.pop();
  assert.throws(() => validateStudy(missingChapter, lesson, config), /A1 ayrıntılı anlatım: bütün ders ekranları/);
  const missingTerm = structuredClone(blocks);
  for (const block of missingTerm) for (const word of block.glossary) word.sourceTerms = word.sourceTerms.filter(term => term !== 'half past');
  assert.throws(() => validateStudy(missingTerm, lesson, config), /açıklaması eksik kelimeler: half past/);
});
