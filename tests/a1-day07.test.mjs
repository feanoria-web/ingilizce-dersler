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
const LESSON = 'lessons/a1/day-07.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};
const sections = type => lesson.screens.flatMap(s => (s.sections || []).filter(x => x.type === type));

test('the 21 November A1 lesson runs 09.00–13.00 in four parts and covers every pasted outcome', () => {
  assert.equal(lesson.meta.level, 'A1');
  assert.deepEqual(lesson.blocks.map(b => b.minutes), [50, 50, 50, 60]);
  for (const block of lesson.blocks) assert.equal(lesson.screens.filter(s => s.block === block.n && !s.extra && s.type !== 'break').reduce((sum, s) => sum + s.min, 0), block.minutes, `block ${block.n}`);
  const ids = lesson.screens.map(s => s.id);
  for (const id of ['adjectives', 'opposites', 'adjective-text', 'places', 'pronouns', 'pronoun-table', 'colours', 'favourite', 'comparatives', 'body', 'face-organs', 'appearance']) assert.ok(ids.includes(id), id);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !['warm', 'close'].includes(s.id))) assert.ok(screen.sections.some(x => x.type === 'explain' && /^Konu anlatımı/.test(x.title)), `${screen.id}: topic explanation`);
  const text = JSON.stringify(lesson);
  for (const phrase of ['opposite of', 'another word for', 'What\'s this place?', 'I – me – my – mine', 'What colour is it?', 'My favourite', 'bigger than', 'more expensive', 'foot → feet', 'We think with our brain', 'long curly', 'hasn\'t got']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a1/day-07'));
});

test('the body, face and organ pictures are drawn in the lesson and every label has a point on the picture', () => {
  const maps = sections('bodyMap');
  assert.deepEqual(maps.map(m => m.pic), ['body', 'face', 'organs']);
  for (const m of maps) {
    const art = new RegExp(`${m.pic}: \\{[\\s\\S]*?pts: \\{([^}]*)\\}`).exec(source);
    assert.ok(art, `${m.pic} drawing`);
    for (const [k, word] of m.items) {
      assert.match(art[1], new RegExp(`\\b${k}: \\[`), `${m.pic}: ${k}`);
      assert.match(word, /^[a-z ]+$/);
    }
  }
  assert.ok(sections('bodyMap')[0].items.length >= 16);
  assert.ok(source.includes('R.bodyMap = ') && source.includes('B.bodyMap = '));
  assert.ok(!/<img\b[^>]*src="https?:/i.test(source), 'no external pictures are needed');
});

test('the colour-in listening has an answer for every object and the text names each colour', () => {
  const [ci] = sections('colourIn');
  assert.ok(ci);
  assert.deepEqual(Object.keys(ci.key).sort(), [...ci.objects].sort());
  const transcript = JSON.stringify(lesson.screens.find(s => s.id === 'colours'));
  for (const [object, colour] of Object.entries(ci.key)) assert.match(transcript, new RegExp(`${object}[^.]*\\b${colour}\\b|${colour} ${object}`, 'i'), `${object} → ${colour}`);
});

test('appearance portraits match their descriptions', () => {
  for (const look of sections('looks')) for (const p of look.people) {
    if (p.glasses) assert.match(p.text, /glasses/, p.name);
    if (p.beard) assert.match(p.text, /beard/, p.name);
    if (p.moustache) assert.match(p.text, /moustache/, p.name);
    if (p.hair === 'bald') assert.match(p.text, /bald/, p.name);
    if (p.hair && p.hair !== 'bald') assert.match(p.text, new RegExp(p.hc), p.name);
    if (p.h === 'tall' || p.h === 'short') assert.match(p.text, new RegExp(`\\b${p.h}\\b`), p.name);
  }
});

test('the lesson does not copy sentences from the previous two A1 lessons', async () => {
  for (const previous of ['a1/day-05', 'a1/day-06']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, `lessons/${previous}.html`), 'utf8')).screens.filter(s => s.block > 0));
    assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s)), [], previous);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
