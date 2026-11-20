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
const LESSON = 'lessons/a1/day-09.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};
const sections = type => lesson.screens.flatMap(s => (s.sections || []).filter(x => x.type === type));
const TEACHING = ['review-words', 'review-pronouns', 'review-body', 'clothes', 'clothes-listen', 'wearing', 'hungry', 'food-words', 'cafe', 'countable', 'house', 'my-room'];

test('the 28 November lesson starts with a summary of last week and then covers every pasted outcome', () => {
  assert.equal(lesson.meta.level, 'A1');
  assert.deepEqual(lesson.blocks.map(b => b.minutes), [50, 50, 50, 60]);
  assert.match(lesson.blocks[0].title, /özet/i);
  for (const block of lesson.blocks) assert.equal(lesson.screens.filter(s => s.block === block.n && !s.extra && s.type !== 'break').reduce((sum, s) => sum + s.min, 0), block.minutes, `block ${block.n}`);
  assert.deepEqual(lesson.screens.filter(s => s.block === 1 && !s.extra && s.type !== 'break').map(s => s.id), ['warm', 'review-words', 'review-pronouns', 'review-body']);
  for (const id of TEACHING) assert.ok(lesson.screens.some(s => s.id === id), id);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !['warm', 'close'].includes(s.id))) assert.ok(screen.sections.some(x => x.type === 'explain' && /^Konu anlatımı/.test(x.title)), `${screen.id}: topic explanation`);
  const text = JSON.stringify(lesson);
  for (const phrase of ['summer clothes', 'winter clothes', "She's wearing", "isn't wearing", 'Is she wearing', "I'm hungry", "I'm thirsty", 'Can I have', 'How much is', 'How much are', 'tomatoes', 'strawberries', 'Aa Sözlük', 'countable', 'uncountable', "There's a", 'There are', 'Is there', 'under the bed', 'in front of']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a1/day-09'));
});

test('clothes, the house and the room are drawn in the lesson; every label has a point and every drawing exists', () => {
  for (const renderer of ['clothes', 'menu', 'bodyMap', 'prepPics', 'looks']) assert.ok(source.includes(`R.${renderer} = `), renderer);
  const drawn = new Set([...source.slice(source.indexOf('const CL = {'), source.indexOf('const clArt')).matchAll(/^\s+"?([\w-]+)"?: `/gm)].map(m => m[1]));
  const used = sections('clothes').flatMap(s => s.items.map(it => it.k));
  for (const k of used) assert.ok(drawn.has(k), `clothes drawing: ${k}`);
  assert.ok(new Set(used).size >= 20, 'twenty different clothes are shown');
  const maps = sections('bodyMap');
  assert.deepEqual([...new Set(maps.map(m => m.pic))].sort(), ['body', 'house', 'room']);
  for (const m of maps) for (const [k] of m.items) assert.match(source, new RegExp(`(?:\\b|")${k}"?: \\[\\d`), `${m.pic}: ${k}`);
  assert.ok(!/<img\b[^>]*src="https?:/i.test(source), 'no external pictures are needed');
});

test('the listen-and-colour clothes task has an answer for every item and the text names each colour', () => {
  const task = sections('clothes').find(s => s.mode === 'colour');
  assert.ok(task);
  assert.deepEqual(Object.keys(task.key).sort(), [...task.objects].sort());
  assert.deepEqual(task.items.map(it => it.k).sort(), [...task.objects].sort());
  const transcript = JSON.stringify(lesson.screens.find(s => s.id === 'clothes-listen').sections.find(x => x.type === 'modelHidden'));
  for (const [item, colour] of Object.entries(task.key)) assert.match(transcript, new RegExp(`${colour} ${item}|${item} (?:is|are) ${colour}|${item}\\? They're ${colour}`, 'i'), `${item} → ${colour}`);
});

test('menu prices agree with the exercises and the café dialogue', () => {
  const [menu] = sections('menu');
  const price = Object.fromEntries(menu.sections.flatMap(s => s.items).map(([, n, p]) => [n, p]));
  assert.equal(price['Lentil soup'], 60);
  assert.equal(price.Pizza, 150);
  assert.equal(price.Chips, 45);
  assert.equal(price.Tea + price['Simit with cheese'], 65);
  assert.equal(price.Menemen + price.Tea, 140);
  assert.ok(price['Ice cream'] < price['Chocolate cake'] && price.Tea < price['Turkish coffee'] && price.Pizza > price.Menemen);
  assert.equal(2 * price.Lemonade, 110);
  assert.match(JSON.stringify(lesson.screens.find(s => s.id === 'cafe')), /That's 140 lira/);
});

test('every teaching screen has a reading or listening, a class activity or game, and a research or speaking task', () => {
  for (const id of TEACHING) {
    const screen = lesson.screens.find(s => s.id === id);
    assert.ok(screen.sections.some(x => x.type === 'reading' || x.type === 'model' || (x.type === 'callout' && /^Dinleme/.test(x.title))), `${id}: reading or listening`);
    assert.ok(screen.sections.some(x => ['activity', 'memory'].includes(x.type)), `${id}: activity or game`);
    assert.ok(screen.sections.some(x => (x.type === 'inputTable' && /^Araştıralım/.test(x.title)) || x.type === 'promptCards' || x.type === 'writer'), `${id}: research or speaking`);
    assert.ok(screen.sections.length >= 10, `${id}: ${screen.sections.length} sections`);
  }
  assert.ok(sections('reading').length >= 8);
  assert.ok(sections('callout').filter(x => /^Dinleme/.test(x.title)).length >= 9);
});

test('the summary and the new lesson do not copy sentences from last week\'s lessons', async () => {
  for (const previous of ['a1/day-07', 'a1/day-08']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, `lessons/${previous}.html`), 'utf8')).screens.filter(s => s.block > 0));
    assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s)), [], previous);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
