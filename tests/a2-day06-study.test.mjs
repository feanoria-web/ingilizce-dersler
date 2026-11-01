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
const LESSON = 'lessons/a2/day-06.html';
const config = STUDY_LESSONS[LESSON];
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const blocks = await Promise.all([1, 2, 3, 4].map(async n => JSON.parse(await fs.readFile(path.join(ROOT, 'a2-study-06', `block-${n}.json`), 'utf8'))));
const runtime = await fs.readFile(path.join(ROOT, 'assets/b1-study.js'), 'utf8');
const renderer = data => { const window = {}; vm.runInNewContext(runtime, { window, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) } }); return window.EnglishB1Study; };
const stringsOf = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};

test('the two-day A2 lesson covers facts, habits, signs, rules, advice and possibility', () => {
  assert.equal(lesson.meta.level, 'A2');
  const ids = lesson.screens.map(screen => screen.id);
  for (const id of ['opposites', 'fast-slow', 'facts', 'turkey-facts', 'time-expressions', 'frequency', 'weekend', 'dialogue-gap', 'signs', 'mustnt', 'dont-have-to', 'rules', 'problems', 'advice-practice', 'possibility', 'advice-email']) assert.ok(ids.includes(id), id);
  const text = JSON.stringify(lesson);
  for (const phrase of ['It snows in winter.', 'The Earth goes around the Sun.', 'I go to the cinema once a week.', 'I run every morning.', 'I pray every day.', 'I often meet my friends.', 'help people in need', 'KEEP OFF THE GRASS', 'BEWARE OF THE DOG', 'DO NOT TALK TO THE DRIVER', 'PLEASE TURN OFF YOUR MOBILE PHONE', 'NO PHOTOGRAPHY', "You mustn't park here.", "You don't have to get up early on Sundays.", 'You should go to bed earlier.', 'She might not like the present.', 'Wait for the sales.']) assert.ok(text.includes(phrase), phrase);
  assert.ok(!text.includes('printCards'), 'photocopy material lives inside the lesson');
  for (const block of [1, 2, 3, 4]) assert.equal(lesson.screens.filter(screen => screen.block === block && !screen.extra && screen.type !== 'break').reduce((sum, screen) => sum + screen.min, 0), 100, `block ${block}`);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !/^(warm|warm3|close|close-day1)$/.test(s.id))) assert.ok(screen.sections.some(section => section.type === 'explain' && /^Konu anlatımı/.test(section.title)), `${screen.id}: topic explanation`);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a2/day-06'));
});

test('the new lesson does not copy the previous A2 lesson’s sentences', async () => {
  const previous = readStudyLesson(await fs.readFile(path.join(ROOT, 'lessons/a2/day-05.html'), 'utf8'));
  const before = stringsOf(previous.screens.filter(s => s.block > 0)), now = stringsOf(lesson.screens.filter(s => s.block > 0));
  const shared = [...now].filter(s => before.has(s));
  assert.deepEqual(shared, []);
});

test('every non-game teaching screen and every phrase-bank item has detailed Turkish teaching material', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const teaching = lesson.screens.filter(screen => screen.block > 0 && screen.type !== 'break' && !screen.extra).map(screen => screen.id);
  assert.deepEqual(data.chapters.map(chapter => chapter.screenId).sort(), [...teaching].sort());
  assert.deepEqual(data.blocks, [1, 2, 3, 4]);
  assert.equal(data.stats.sourceTerms, 65);
  assert.ok(data.stats.wordCount >= 21000, `${data.stats.wordCount} words`);
  for (const block of blocks) assert.ok(studyWordCount(block) >= 5000, `Block ${block.block} needs detailed explanations`);
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
  const other = await fs.readFile(path.join(ROOT, 'lessons/a2/day-04.html'), 'utf8');
  assert.equal(await instrumentB1Study(other, 'lessons/a2/day-04.html', ROOT), other);
});

test('the renderer shows four A2 sections and the A2 search hint', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const study = renderer(data);
  const home = study.render('home');
  for (const block of [1, 2, 3, 4]) assert.ok(home.includes(`<h3>${block}. bölüm</h3>`), `block ${block}`);
  assert.ok(study.render('vocab').includes('often, mustn'));
  assert.ok(study.render('dont-have-to').includes('mustn'));
  assert.ok(study.render('signs').includes('KEEP OFF THE GRASS'));
  assert.equal(study.render('sign-race'), '', 'game screens keep their own activity only');
});

test('a missing chapter or phrase-bank item stops publication', () => {
  const missingChapter = structuredClone(blocks);
  missingChapter[3].chapters.pop();
  assert.throws(() => validateStudy(missingChapter, lesson, config), /A2 ayrıntılı anlatım: bütün ders ekranları/);
  const missingTerm = structuredClone(blocks);
  for (const block of missingTerm) for (const word of block.glossary) word.sourceTerms = word.sourceTerms.filter(term => term !== 'might not');
  assert.throws(() => validateStudy(missingTerm, lesson, config), /açıklaması eksik kelimeler: might not/);
});
