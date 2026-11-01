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
const LESSON = 'lessons/b1/day-07.html';
const config = STUDY_LESSONS[LESSON];
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const blocks = await Promise.all([1, 2, 3, 4].map(async n => JSON.parse(await fs.readFile(path.join(ROOT, 'b1-study-07', `block-${n}.json`), 'utf8'))));
const runtime = await fs.readFile(path.join(ROOT, 'assets/b1-study.js'), 'utf8');
const renderer = data => { const window = {}; vm.runInNewContext(runtime, { window, document: { getElementById: () => ({ textContent: JSON.stringify(data) }) } }); return window.EnglishB1Study; };
const stringsOf = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};

test('the two-day B1 lesson covers bargaining, paying, online shopping, complaints, a survey, Atatürk, trends, opinions, offers and advice', () => {
  assert.equal(lesson.meta.level, 'B1');
  const ids = lesson.screens.map(screen => screen.id);
  for (const id of ['haggle', 'pay', 'online-shop', 'complain-shop', 'complain-online', 'survey', 'ataturk-life', 'ataturk-legacy', 'fashion-trends', 'ads', 'tech-consumption', 'agree-disagree', 'accept-refuse', 'clothes-advice', 'debate', 'advice-message']) assert.ok(ids.includes(id), id);
  const text = JSON.stringify(lesson);
  for (const phrase of ['Could you do it for 800?', 'If I buy two, will you give me a discount?', "Let's meet halfway.", 'That comes to 2,340 lira.', 'Your card has been declined.', 'Proceed to checkout', 'Your order has been placed', 'It keeps switching off.', 'I am writing to complain about', 'I look forward to hearing from you.', 'Tick all that apply.', 'was born} in Selanik', 'the Republic {p|was proclaimed}', 'had landed} in İzmir', 'Peace at home, peace in the world.', 'more and more', 'is aimed at teenagers', 'Technology has changed the way we shop.', 'I see what you mean, but', 'Neither do I.', "That's very kind of you", 'It really suits you', 'Sorry to interrupt, but']) assert.ok(text.includes(phrase), phrase);
  assert.ok(!text.includes('printCards'), 'photocopy material lives inside the lesson');
  for (const block of [1, 2, 3, 4]) assert.equal(lesson.screens.filter(screen => screen.block === block && !screen.extra && screen.type !== 'break').reduce((sum, screen) => sum + screen.min, 0), 100, `block ${block}`);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !/^(warm|warm3|close|close-day1)$/.test(s.id))) assert.ok(screen.sections.some(section => section.type === 'explain' && /^Konu anlatımı/.test(section.title)), `${screen.id}: topic explanation`);
  assert.deepEqual(lesson.blocks.map(block => block.title.split(' · ')[0]), ['3 Kasım', '3 Kasım', '4 Kasım', '4 Kasım']);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'b1/day-07'));
});

test('the new lesson does not copy the previous B1 lesson’s sentences', async () => {
  const previous = readStudyLesson(await fs.readFile(path.join(ROOT, 'lessons/b1/day-06.html'), 'utf8'));
  const before = stringsOf(previous.screens.filter(s => s.block > 0)), now = stringsOf(lesson.screens.filter(s => s.block > 0));
  assert.deepEqual([...now].filter(s => before.has(s)), []);
});

test('every non-game teaching screen and every phrase-bank item has detailed B1 teaching material', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const teaching = lesson.screens.filter(screen => screen.block > 0 && screen.type !== 'break' && !screen.extra).map(screen => screen.id);
  assert.deepEqual(data.chapters.map(chapter => chapter.screenId).sort(), [...teaching].sort());
  assert.deepEqual(data.blocks, [1, 2, 3, 4]);
  assert.equal(data.stats.sourceTerms, 102);
  assert.ok(data.stats.wordCount >= 40000, `${data.stats.wordCount} words`);
  for (const block of blocks) assert.ok(studyWordCount(block) >= 9000, `Block ${block.block} needs detailed explanations`);
  for (const chapter of data.chapters) {
    assert.equal(chapter.patterns.length, 3, chapter.screenId);
    assert.ok(chapter.sentenceNotes?.length >= 6, `${chapter.screenId}: lesson sentences explained one by one`);
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
  const previous = await fs.readFile(path.join(ROOT, 'lessons/b1/day-06.html'), 'utf8');
  const previousGuide = await instrumentB1Study(previous, 'lessons/b1/day-06.html', ROOT);
  assert.ok(previousGuide.includes('worth the money, taksit'), 'the B1 day-06 guide keeps its own material');
  assert.ok(!previousGuide.includes('meet halfway, has been placed'), 'the two B1 guides stay separate');
});

test('the renderer shows four B1 sections, sentence notes and the B1 day-07 search hint', async () => {
  const data = await loadStudy(ROOT, lesson, config);
  const study = renderer(data);
  const home = study.render('home');
  for (const block of [1, 2, 3, 4]) assert.ok(home.includes(`<h3>${block}. bölüm</h3>`), `block ${block}`);
  assert.ok(study.render('vocab').includes('meet halfway, has been placed, suits'));
  assert.ok(study.render('ataturk-life').includes('was born'));
  assert.ok(study.render('haggle').includes('Dersteki cümleleri tek tek çözelim'));
  assert.equal(study.render('basket-race'), '', 'game screens keep their own activity only');
});

test('a missing chapter or phrase-bank item stops publication', () => {
  const missingChapter = structuredClone(blocks);
  missingChapter[1].chapters.pop();
  assert.throws(() => validateStudy(missingChapter, lesson, config), /B1 ayrıntılı anlatım: bütün ders ekranları/);
  const missingTerm = structuredClone(blocks);
  for (const block of missingTerm) for (const word of block.glossary) word.sourceTerms = word.sourceTerms.filter(term => term !== 'Tick all that apply.');
  assert.throws(() => validateStudy(missingTerm, lesson, config), /açıklaması eksik kelimeler: Tick all that apply\./);
});
