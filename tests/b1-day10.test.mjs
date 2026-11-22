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
const LESSON = 'lessons/b1/day-10.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};
const sections = type => lesson.screens.flatMap(s => (s.sections || []).filter(x => x.type === type));
const TEACHING = ['geography', 'notes', 'summary-skill', 'my-education', 'my-school', 'future-study', 'adverts', 'enquiry', 'certificates', 'methods', 'aims', 'debate', 'plans', 'language-plan', 'which-language', 'what-they-do', 'dream-job', 'job-talks'];

test('the B1 week lesson covers 23, 24 and 25 November in six 100-minute parts', () => {
  assert.equal(lesson.meta.level, 'B1');
  assert.deepEqual(lesson.blocks.map(b => b.minutes), [100, 100, 100, 100, 100, 100]);
  assert.deepEqual(lesson.blocks.map(b => b.title.split(' · ')[0]), ['23 Kasım', '23 Kasım', '24 Kasım', '24 Kasım', '25 Kasım', '25 Kasım']);
  for (const block of lesson.blocks) assert.equal(lesson.screens.filter(s => s.block === block.n && !s.extra && s.type !== 'break').reduce((sum, s) => sum + s.min, 0), 100, `block ${block.n}`);
  for (const id of TEACHING) assert.ok(lesson.screens.some(s => s.id === id), id);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !/^(warm\d?|close(-day\d)?)$/.test(s.id))) assert.ok(screen.sections.some(x => x.type === 'explain' && /^Konu anlatımı/.test(x.title)), `${screen.id}: topic explanation`);
  const text = JSON.stringify(lesson);
  for (const phrase of ['geograph', 'Kızılırmak', 'skimming', 'scanning', 'According to', 'In other words', 'graduated', 'where everybody knows your name', 'riding camp', 'host family', 'I am writing to enquire', 'Yours faithfully', 'Could you tell me when', 'certificate', 'language exchange', 'so that I can', "I'm going to", 'is responsible for', "I've always wanted", 'experience']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'b1/day-10'));
});

test('every teaching screen has a reading, listening or model text and a class activity or speaking task', () => {
  for (const id of TEACHING) {
    const screen = lesson.screens.find(s => s.id === id);
    assert.ok(screen.sections.some(x => ['reading', 'model'].includes(x.type) || (x.type === 'callout' && /^Dinleme/.test(x.title))), `${id}: text`);
    assert.ok(screen.sections.some(x => ['activity', 'promptCards'].includes(x.type)), `${id}: activity`);
  }
  assert.ok(sections('reading').length >= 12);
  assert.ok(sections('callout').filter(x => /^Dinleme/.test(x.title)).length >= 8);
  assert.ok(sections('writer').length >= 6);
});

test('the formal email checker rejects contractions and the model email follows the rules it teaches', () => {
  const writer = sections('writer').find(w => /enquiry/i.test(w.titleTR));
  const neg = writer.checks.find(c => c.neg);
  assert.ok(neg && new RegExp(neg.re).test("I'm writing"));
  const model = sections('model').find(m => /Örnek e-posta/.test(m.title)).text;
  for (const phrase of ['Dear Sir or Madam', 'I am writing to enquire', 'I look forward to hearing from you', 'Yours faithfully']) assert.ok(model.includes(phrase), phrase);
  assert.ok(!/\b(I'm|can't|don't|I'd)\b/.test(model), 'no contractions in the formal model');
});

test('the example texts avoid Turkish first names that could belong to students', () => {
  const text = JSON.stringify(lesson.screens.filter(s => s.block > 0));
  for (const name of ['Aylin', 'Sinem', 'Murat', 'Hande', 'Kemal']) assert.ok(!new RegExp(`\\b${name}\\b`).test(text), name);
});

test('the lesson does not copy sentences from the previous B1 lessons', async () => {
  for (const previous of ['b1/day-07', 'b1/day-08']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, `lessons/${previous}.html`), 'utf8')).screens.filter(s => s.block > 0));
    // fixed formal-email formulas are taught on purpose; they are not copied content
    const formulas = /look forward to hearing from you|I would be grateful if you could/;
    assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s) && !formulas.test(s)), [], previous);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
