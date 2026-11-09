import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { readStudyLesson } from '../scripts/b1-study.mjs';
import { instrumentAssessments } from '../scripts/instrument-assessments.mjs';
import { instrumentBreakReview } from '../scripts/inject-break-review.mjs';
import { instrumentLearning } from '../scripts/instrument-learning.mjs';
import { assertPublicLessonHtml } from '../scripts/extract-teacher-guides.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LESSON = 'lessons/a2/day-07.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};

test('the A2 Atatürk special covers 9 and 10 November in four 100-minute parts', () => {
  assert.equal(lesson.meta.level, 'A2');
  const ids = lesson.screens.map(screen => screen.id);
  for (const id of ['childhood', 'young-soldier', 'canakkale', 'peace', 'year-1919', 'assembly-sakarya', 'victory', 'people', 'opening', 'silence', 'after-silence', 'last-years', 'farewell', 'anitkabir', 'his-words', 'principles', 'youth-address', 'ceremony', 'letter']) assert.ok(ids.includes(id), id);
  for (const block of [1, 2, 3, 4]) assert.equal(lesson.screens.filter(screen => screen.block === block && !screen.extra && screen.type !== 'break').reduce((sum, screen) => sum + screen.min, 0), 100, `block ${block}`);
  assert.deepEqual(lesson.blocks.map(block => block.title.split(' · ')[0]), ['9 Kasım', '9 Kasım', '10 Kasım', '10 Kasım']);
  const text = JSON.stringify(lesson);
  for (const phrase of ['57th Regiment', 'Amasya', 'Mudanya', 'Şerife', 'Savarona', 'Road of Lions', 'Head Teacher', 'Your first duty', 'Dear Atatürk']) assert.ok(text.includes(phrase), phrase);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !['warm', 'close', 'close-day1', 'opening', 'silence'].includes(s.id))) assert.ok(screen.sections.some(section => section.type === 'explain' && /^Konu anlatımı/.test(section.title)), `${screen.id}: topic explanation`);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a2/day-07'));
});

test('10 November starts at 09.00 and the 09.05 screen sets a one-minute timer for the silence', () => {
  const order = lesson.screens.filter(screen => screen.block === 3).map(screen => screen.id);
  assert.deepEqual(order.slice(0, 3), ['opening', 'silence', 'after-silence']);
  const silence = lesson.screens.find(screen => screen.id === 'silence');
  assert.equal(silence.min, 1, 'the bottom-bar timer is set from the screen minutes');
  assert.match(silence.title, /09\.05/);
  assert.ok(JSON.stringify(silence).includes('01:00'));
  assert.ok(lesson.homeLinks.some(([id]) => id === 'silence'), 'the silence screen is one tap away from the lesson home');
});

test('fictional memories in the listening texts are labelled as fictional', () => {
  for (const id of ['canakkale', 'last-years']) {
    const screen = lesson.screens.find(s => s.id === id);
    assert.match(JSON.stringify(screen), /[Kk]urgusal/, id);
  }
});

test('the special does not copy sentences from the previous A2 lesson', async () => {
  const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, 'lessons/a2/day-06.html'), 'utf8')).screens.filter(s => s.block > 0));
  assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s)), []);
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
