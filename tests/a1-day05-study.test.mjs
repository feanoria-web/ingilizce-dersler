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
const LESSON = 'lessons/a1/day-05.html';
const config = STUDY_LESSONS[LESSON];
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const blocks = await Promise.all([1, 2, 3].map(async n => JSON.parse(await fs.readFile(path.join(ROOT, 'a1-study-05', `block-${n}.json`), 'utf8'))));
const runtime = await fs.readFile(path.join(ROOT, 'assets/b1-study.js'), 'utf8');
const renderer = data => { const window = {}; vm.runInNewContext(runtime, { window, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) } }); return window.EnglishB1Study; };

test('the three-day A1 lesson covers the 8 and 14 November outcomes, jobs, this / that and Atatürk without repeating lesson 4', () => {
  assert.equal(lesson.meta.level, 'A1');
  const ids = lesson.screens.map(screen => screen.id);
  for (const id of ['routine-pictures', 'collocations', 'verb-forms', 'have-got', 'possessive-adj', 'family-words', 'family-tree', 'possessive-s', 'noun-phrases', 'wh-questions', 'wh-practice', 'jobs', 'what-do-you-do', 'jobs-match', 'write-jobs', 'dream-job', 'objects', 'this-that', 'describe', 'picture-say', 'ataturk', 'ataturk-today']) assert.ok(ids.includes(id), id);
  const text = JSON.stringify(lesson);
  for (const phrase of ['watch a film', 'listen to music', 'pray', 'I\'ve got a car.', 'She\'s got two sons.', 'Murat and his wife', 'Ali is my mother\'s brother.', 'Whose bag is this?', 'Where do you go on Sundays?', 'What do you do?', 'I want to be a pilot', 'These are new. Those are old.', 'Atatürk was born in 1881.', '29 October 1923', '10 November 1938', 'Anıtkabir is in Ankara.', "Hasan and Zehra's day", 'After lunch, they have a rest.', 'the twenty-third of April', 'Peace at home, peace in the world.', 'won the Great Victory']) assert.ok(text.includes(phrase), phrase);
  for (const repeated of ['What time do you get up?', 'She has breakfast alone.', 'First, I get up. Then I have a shower.', 'How do you go to work?']) assert.ok(!text.includes(repeated), `lesson 4 sentence repeated: ${repeated}`);
  for (const screen of lesson.screens.filter(screen => screen.block > 0 && screen.type !== 'break' && !screen.extra && !['warm2', 'close'].includes(screen.id))) assert.ok(screen.sections.some(section => section.type === 'explain'), `${screen.id}: topic explanation`);
  const trees = lesson.screens.flatMap(screen => screen.sections || []).filter(section => section.type === 'familyTree');
  assert.ok(trees.length >= 2, 'the family screens share one family tree');
  for (const tree of trees) assert.deepEqual(tree.tree, trees[0].tree);
  assert.ok(!text.includes('printCards') && !/Fotokopi/i.test(text), 'photocopy material lives inside the lesson');
  for (const block of [1, 2, 3]) assert.equal(lesson.screens.filter(screen => screen.block === block && !screen.extra && screen.type !== 'break').reduce((sum, screen) => sum + screen.min, 0), 150, `block ${block}`);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a1/day-05'));
});

test('every non-game teaching screen and every phrase-bank item has detailed Turkish teaching material', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const teaching = lesson.screens.filter(screen => screen.block > 0 && screen.type !== 'break' && !screen.extra).map(screen => screen.id);
  assert.deepEqual(data.chapters.map(chapter => chapter.screenId).sort(), [...teaching].sort());
  assert.deepEqual(data.blocks, [1, 2, 3]);
  assert.equal(data.stats.sourceTerms, 77);
  assert.ok(data.stats.wordCount >= 24000, `${data.stats.wordCount} words`);
  for (const block of blocks) assert.ok(studyWordCount(block) >= 7000, `Block ${block.block} needs detailed explanations`);
  for (const chapter of data.chapters) {
    assert.ok(chapter.patterns.length >= 2, chapter.screenId);
    assert.ok(chapter.sentenceNotes?.length >= 3, `${chapter.screenId}: lesson sentences explained`);
    for (const pattern of chapter.patterns) {
      assert.ok(pattern.checks?.length && pattern.mistakes?.length, `${chapter.screenId}/${pattern.id}: own practice`);
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

test('the renderer shows three A1 sections and the A1 search hint', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const study = renderer(data);
  const home = study.render('home');
  for (const block of [1, 2, 3]) assert.ok(home.includes(`<h3>${block}. bölüm</h3>`), `block ${block}`);
  assert.ok(!home.includes('<h3>4. bölüm</h3>'));
  assert.ok(study.render('vocab').includes('listen to, has got, whose'));
  assert.ok(study.render('family-tree').includes('Deniz'));
  assert.ok(study.render('ataturk').includes('1881'));
  assert.equal(study.render('family-flash'), '', 'game screens keep their own activity only');
});

test('a missing chapter or phrase-bank item stops publication', () => {
  const missingChapter = structuredClone(blocks);
  missingChapter[1].chapters.pop();
  assert.throws(() => validateStudy(missingChapter, lesson, config), /A1 ayrıntılı anlatım: bütün ders ekranları/);
  const missingTerm = structuredClone(blocks);
  for (const block of missingTerm) for (const word of block.glossary) word.sourceTerms = word.sourceTerms.filter(term => term !== 'pray');
  assert.throws(() => validateStudy(missingTerm, lesson, config), /açıklaması eksik kelimeler: pray/);
});
