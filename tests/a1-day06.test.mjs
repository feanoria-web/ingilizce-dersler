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
const LESSON = 'lessons/a1/day-06.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};

test('the 8 November A1 lesson teaches the past simple and Atatürk in four timed parts from 09.00 to 13.00', () => {
  assert.equal(lesson.meta.level, 'A1');
  const ids = lesson.screens.map(screen => screen.id);
  for (const id of ['now-then', 'was-were', 'regular-ed', 'irregular', 'negative', 'past-questions', 'weekend', 'ataturk-verbs', 'ataturk-watch', 'ataturk-samsun', 'ataturk-republic', 'ataturk-letters', 'ataturk-loved', 'ataturk-november', 'ataturk-book', 'media']) assert.ok(ids.includes(id), id);
  const text = JSON.stringify(lesson);
  for (const phrase of ['Every day I walk to work. Yesterday I took the bus.', 'I was at home.', 'visited · wanted · waited', 'go → went', "I didn't go to work.", 'Did you watch the match?', 'A watch saved his life.', 'An old ship left Istanbul.', 'The journey took three days.', "couldn't read", 'Every year on 10 November, we', 'The clocks stopped at 9.05.']) assert.ok(text.includes(phrase), phrase);
  assert.deepEqual([1, 2, 3, 4].map(block => lesson.screens.filter(screen => screen.block === block && !screen.extra && screen.type !== 'break').reduce((sum, screen) => sum + screen.min, 0)), [50, 50, 50, 60]);
  assert.equal(lesson.screens.filter(screen => screen.type === 'break').length, 3);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !['warm', 'warm3', 'close'].includes(s.id))) assert.ok(screen.sections.some(section => section.type === 'explain' && /^Konu anlatımı/.test(section.title)), `${screen.id}: topic explanation`);
  assert.ok(!text.includes('printCards'));
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a1/day-06'));
});

test('listening tasks and verified video links are in the lesson; links open in a new tab', () => {
  const sections = lesson.screens.flatMap(screen => screen.sections || []);
  assert.ok(sections.filter(section => section.type === 'callout' && /^Dinleme:/.test(section.title) && /data-say="/.test(section.text)).length >= 6);
  assert.ok(sections.some(section => section.type === 'dictation') && sections.some(section => section.type === 'dialogue'));
  const links = [...JSON.stringify(lesson).matchAll(/href=\\"(https:[^\\"]+)\\"/g)].map(match => match[1]);
  assert.ok(links.length >= 10);
  for (const link of links) assert.match(link, /^https:\/\/(learnenglishteens\.britishcouncil\.org|learnenglishkids\.britishcouncil\.org|www\.youtube\.com\/watch\?v=[\w-]{11}|www\.anitkabir\.tsk\.tr|www\.google\.com\/maps\/search\/)/);
  assert.ok(!/href="https:[^"]+"(?![^>]*target="_blank")/.test(JSON.stringify(sections).replace(/\\"/g, '"')), 'every link opens in a new tab');
});

test('the lesson does not copy sentences from the other A1 lessons or from B1 day 07', async () => {
  const now = sentences(lesson.screens.filter(s => s.block > 0));
  for (const other of ['a1/day-05', 'a1/day-04', 'b1/day-07']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, 'lessons', `${other}.html`), 'utf8')).screens.filter(s => s.block > 0));
    assert.deepEqual([...now].filter(s => before.has(s)), [], other);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
