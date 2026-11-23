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
const LESSON = 'lessons/a2/day-08.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};
const sections = type => lesson.screens.flatMap(s => (s.sections || []).filter(x => x.type === type));
const TEACHING = ['now', 'simple-continuous', 'phone', 'permission', 'free-time', 'suggestions', 'weekend-plan', 'problems', 'ataturk-free', 'invitations', 'replies', 'prefer', 'plan-event', 'likes', 'reactions', 'sports', 'hobby-words', 'weather', 'time', 'numbers', 'expressions'];

test('the A2 week lesson covers 23 and 24 November in four 100-minute parts plus a 100-minute extra panel', () => {
  assert.equal(lesson.meta.level, 'A2');
  assert.deepEqual(lesson.blocks.map(b => b.minutes), [100, 100, 100, 100, 100]);
  assert.deepEqual(lesson.blocks.map(b => b.title.split(' · ')[0]), ['23 Kasım', '23 Kasım', '24 Kasım', '24 Kasım', 'Ek panel']);
  for (const block of lesson.blocks) assert.equal(lesson.screens.filter(s => s.block === block.n && !s.extra && s.type !== 'break').reduce((sum, s) => sum + s.min, 0), 100, `block ${block.n}`);
  for (const id of TEACHING) assert.ok(lesson.screens.some(s => s.id === id), id);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !['warm', 'warm2', 'warm3', 'close', 'close-day1', 'close-panel'].includes(s.id))) assert.ok(screen.sections.some(x => x.type === 'explain' && /^Konu anlatımı/.test(x.title)), `${screen.id}: topic explanation`);
  const text = JSON.stringify(lesson);
  for (const phrase of ['these days', "I'm still waiting", 'I usually', 'Can you speak up', 'Can I sit here', 'How often', "Let's", 'Shall we', 'How about', 'What if it rains', 'Would you like to come', "I'd love to", "I'm afraid I can't", "I'd rather", 'Instead of', "I don't mind", 'No way!', 'Me neither', 'go skiing', 'do yoga', 'a swimming course', 'Atatürk', 'It was rainy yesterday', 'It will be foggy tomorrow', 'Unbelievable!', 'half past', 'quarter to', 'three hundred and sixty-five', 'Bless you!', 'Get well soon!', 'Happy birthday!', 'raining cats and dogs']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a2/day-08'));
});

test('every teaching screen has a reading or listening and a class activity, game or speaking task', () => {
  for (const id of TEACHING) {
    const screen = lesson.screens.find(s => s.id === id);
    assert.ok(screen.sections.some(x => ['reading', 'model', 'dialogue'].includes(x.type) || (x.type === 'callout' && /^Dinleme/.test(x.title))), `${id}: reading or listening`);
    assert.ok(screen.sections.some(x => ['activity', 'memory', 'promptCards'].includes(x.type)), `${id}: activity`);
  }
  assert.ok(sections('reading').length >= 12);
  assert.ok(sections('callout').filter(x => /^Dinleme/.test(x.title)).length >= 10);
  assert.ok(sections('writer').length >= 4);
});

test('the example texts use no Turkish first names that could belong to students', () => {
  const text = JSON.stringify(lesson.screens.filter(s => s.block > 0));
  for (const name of ['Ece', 'Ayla', 'Leyla', 'Mert', 'Selma', 'Kaan', 'Emre', 'Elif', 'Burak', 'Zehra', 'Aylin', 'Ayşe', 'Jale']) assert.ok(!new RegExp(`\\b${name}\\b`).test(text), name);
});

test('the lesson does not copy sentences from the previous two A2 lessons', async () => {
  for (const previous of ['a2/day-06', 'a2/day-07']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, `lessons/${previous}.html`), 'utf8')).screens.filter(s => s.block > 0));
    assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s)), [], previous);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
