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
const LESSON = 'lessons/b1/day-11.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};
const sections = type => lesson.screens.flatMap(s => (s.sections || []).filter(x => x.type === type));
const TEACHING = ['pp-form', 'experience', 'news-results', 'for-since', 'pp-vs-past', 'pp-conversation', 'ppc-form', 'duration', 'evidence', 'pp-or-ppc', 'work-experience', 'mixed'];

test('the special lesson covers both tenses in four 100-minute parts over two days', () => {
  assert.equal(lesson.meta.level, 'B1');
  assert.deepEqual(lesson.blocks.map(b => b.minutes), [100, 100, 100, 100]);
  assert.deepEqual(lesson.blocks.map(b => b.title.split(' · ')[0]), ['1. gün', '1. gün', '2. gün', '2. gün']);
  for (const block of lesson.blocks) assert.equal(lesson.screens.filter(s => s.block === block.n && !s.extra && s.type !== 'break').reduce((sum, s) => sum + s.min, 0), 100, `block ${block.n}`);
  for (const id of TEACHING) assert.ok(lesson.screens.some(s => s.id === id), id);
  const text = JSON.stringify(lesson);
  for (const phrase of ['have / has + V3', 'A–B–C', 'Have you ever', "I've never", 'been to', 'gone to', 'just', 'already', 'yet', 'still', 'for ten years', 'since 2016', 'How long have you', 'When did you', 'have / has + been + -ing', "I've been running", 'state', 'know', 'cover letter', 'since 2021']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'b1/day-11'));
});

test('topic explanations are detailed: every teaching screen has a long Konu anlatımı with several paragraphs', () => {
  for (const id of TEACHING) {
    const screen = lesson.screens.find(s => s.id === id);
    const explain = screen.sections.find(x => x.type === 'explain' && /^Konu anlatımı/.test(x.title));
    assert.ok(explain, `${id}: explanation`);
    assert.ok(explain.paras.length >= 4, `${id}: at least four paragraphs`);
    assert.ok(explain.paras.join(' ').length >= 1800, `${id}: long explanation`);
    const examples = screen.sections.find(x => x.type === 'examples');
    if (id !== 'mixed') assert.ok(examples && examples.items.length >= 5 && examples.items.every(([en]) => en.length >= 45), `${id}: long examples`);
  }
});

test('every teaching screen has a reading, listening or model text and a class activity or speaking task', () => {
  for (const id of TEACHING) {
    const screen = lesson.screens.find(s => s.id === id);
    assert.ok(screen.sections.some(x => ['reading', 'model', 'dialogue'].includes(x.type) || (x.type === 'callout' && /^Dinleme/.test(x.title))), `${id}: text`);
    assert.ok(screen.sections.some(x => ['activity', 'promptCards'].includes(x.type)), `${id}: activity`);
  }
  assert.ok(sections('reading').length >= 11);
  assert.ok(sections('callout').filter(x => /^Dinleme/.test(x.title)).length >= 11);
  assert.ok(sections('writer').length >= 5);
  assert.ok(sections('pcTimeline').length >= 4);
});

test('the answers in the exercises follow the rules the lesson teaches', () => {
  const gaps = sections('gap').flatMap(g => g.items);
  for (const it of gaps) for (const a of it.a) for (const option of a.split('|')) {
    assert.ok(!/\bbeen (knowing|owning|wanting|believing)\b/.test(option), option);
    const clause = it.q.split(/(?<=[.!?])\s+/).find(part => part.includes('___')) || it.q;
    if (/(?<!since )\b(yesterday|ago|last (week|night|year|weekend))\b/.test(clause)) assert.ok(!/\b(have|has|'ve|'s) \w+(ed|en|wn)\b/.test(option), `${it.q}: no present perfect with finished time`);
  }
  const fixes = sections('fix').flatMap(f => f.items);
  for (const it of fixes) for (const r of it.r) assert.ok(!/\b(have|has|'ve) (been knowing|seen \w+ yesterday)\b/.test(r), r);
});

test('the example texts avoid Turkish first names that could belong to students', () => {
  const text = JSON.stringify(lesson.screens.filter(s => s.block > 0));
  for (const name of ['Aylin', 'Sinem', 'Murat', 'Hande', 'Kemal', 'Kerem', 'Baran', 'Elif', 'Emre', 'Burak', 'Zeynep', 'Mehmet', 'Ayşe']) assert.ok(!new RegExp(`\\b${name}\\b`).test(text), name);
});

test('the lesson does not copy sentences from the previous B1 lessons', async () => {
  for (const previous of ['b1/day-09', 'b1/day-10']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, `lessons/${previous}.html`), 'utf8')).screens.filter(s => s.block > 0));
    // fixed formal-letter formulas are taught on purpose; they are not copied content
    const formulas = /look forward to hearing from you|I am writing to apply/;
    assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s) && !formulas.test(s)), [], previous);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
