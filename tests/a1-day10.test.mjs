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
const LESSON = 'lessons/a1/day-10.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};
const sections = type => lesson.screens.flatMap(s => (s.sections || []).filter(x => x.type === type));
const TEACHING = ['prices', 'menu-listen', 'dictionary', 'plurals', 'food-groups', 'quantities', 'fridge', 'house2', 'room2', 'room-things', 'house-text', 'around-me', 'directions', 'where-i-live', 'my-country', 'meeting', 'days'];

test('the lesson covers 28 and 29 November in eight parts and every outcome of both plan rows', () => {
  assert.equal(lesson.meta.level, 'A1');
  assert.deepEqual(lesson.blocks.map(b => b.minutes), [50, 50, 50, 60, 50, 50, 50, 60]);
  assert.deepEqual(lesson.blocks.map(b => b.title.split(' · ')[0]), ['28 Kasım', '28 Kasım', '28 Kasım', '28 Kasım', '29 Kasım', '29 Kasım', '29 Kasım', '29 Kasım']);
  for (const block of lesson.blocks) assert.equal(lesson.screens.filter(s => s.block === block.n && !s.extra && s.type !== 'break').reduce((sum, s) => sum + s.min, 0), block.minutes, `block ${block.n}`);
  for (const id of TEACHING) assert.ok(lesson.screens.some(s => s.id === id), id);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !['warm', 'warm2', 'close', 'close-day1'].includes(s.id))) assert.ok(screen.sections.some(x => x.type === 'explain' && /^Konu anlatımı/.test(x.title)), `${screen.id}: topic explanation`);
  const text = JSON.stringify(lesson);
  for (const phrase of ['How much is', 'How much are', "today's special", 'without', 'dictionary', 'knives', 'children', 'countable', 'uncountable', 'a bottle of', 'How many', 'Is there any', "There aren't any", 'How many bedrooms are there', 'between', 'opposite', 'washbasin', 'for rent', 'pharmacy', 'Go straight on', 'Turn left', 'on your right', 'Where do you live', 'The capital', 'Ankara', 'Nice to meet you, too', 'Wednesday', 'The day after', 'The day before']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a1/day-10'));
});

test('the lesson has its pictures: house, room, prepositions, menus and a town map built in the engine', () => {
  for (const renderer of ['menu', 'bodyMap', 'prepPics', 'townMap']) assert.ok(source.includes(`R.${renderer} = `), renderer);
  assert.deepEqual([...new Set(sections('bodyMap').map(m => m.pic))].sort(), ['house', 'room']);
  assert.ok(sections('menu').length >= 2);
  assert.ok(!/<img\b[^>]*src="https?:/i.test(source), 'no external pictures are needed');
});

test('the town map and the directions agree', () => {
  const [map] = sections('townMap');
  const rows = map.rows.filter(r => r.cells).map(r => r.cells);
  const at = name => { for (const [ri, row] of rows.entries()) { let ci = 0; for (const c of row) { if (c && c[1] === name) return [ri, ci]; ci += c ? (c[4] || 1) : 1; } } return null; };
  for (const r of rows) assert.equal(r.reduce((n, c) => n + (c ? (c[4] || 1) : 1), 0), map.cols.length);
  // "opposite" pairs across Main Street (row 0 ↔ row 1) and across River Road (row 1 ↔ row 2)
  assert.deepEqual([at('bakery')[1], at('bank')[1]], [0, 0]);
  assert.deepEqual([at('supermarket')[1], at('pharmacy')[1]], [1, 1]);
  assert.equal(at('park')[1], at('café')[1]);
  assert.equal(at('library')[1] + 1, at('mosque')[1], 'the library is next to the mosque');
  assert.equal(at('post office')[1] - 1, at('hospital')[1], 'the post office is next to the hospital');
  assert.equal(at('café')[0], 0, 'the café is north of Main Street');
  assert.equal(at('library')[0], 2, 'the library is south of River Road');
});

test('menu and price-list answers agree with the prices on the screen', () => {
  const lists = sections('menu');
  const price = Object.fromEntries(lists.flatMap(m => m.sections.flatMap(s => s.items)).map(([, n, p]) => [n, p]));
  assert.equal(price.Bananas, 75);
  assert.equal(price['A loaf of bread'], 15);
  assert.equal(price['Eggs (a box of 10)'], 65);
  assert.ok(price.Onions < price.Carrots);
  assert.equal(price['Fish soup (today\'s special)'], 95);
  assert.match(JSON.stringify(lesson.screens.find(s => s.id === 'menu-listen')), /ninety-five lira/);
});

test('every teaching screen is rich: a reading or listening, an activity or game, a speaking, research or writing task and at least twelve sections', () => {
  for (const id of TEACHING) {
    const screen = lesson.screens.find(s => s.id === id);
    assert.ok(screen.sections.some(x => x.type === 'reading' || x.type === 'model' || x.type === 'dialogue' || (x.type === 'callout' && /^Dinleme/.test(x.title))), `${id}: reading or listening`);
    assert.ok(screen.sections.some(x => ['activity', 'memory', 'poll', 'flip'].includes(x.type)), `${id}: activity or game`);
    assert.ok(screen.sections.some(x => (x.type === 'inputTable' && /^Araştıralım/.test(x.title)) || x.type === 'promptCards' || x.type === 'writer'), `${id}: research, speaking or writing`);
    assert.ok(screen.sections.length >= 12, `${id}: ${screen.sections.length} sections`);
  }
  assert.ok(sections('reading').length >= 24);
  assert.ok(sections('callout').filter(x => /^Dinleme/.test(x.title)).length >= 20);
  assert.ok(sections('writer').length >= 4);
});

test('the example texts use no Turkish first names that could belong to students', () => {
  const text = JSON.stringify(lesson.screens.filter(s => s.block > 0));
  for (const name of ['Selin', 'Ayşe', 'Fatma', 'Mehmet', 'Ahmet', 'Elif', 'Zeynep', 'Emre', 'Burak', 'Mert', 'Firdevs', 'Furkan', 'Berat', 'Yağmur']) assert.ok(!new RegExp(`\\b${name}\\b`).test(text), name);
});

test('the lesson does not copy sentences from the previous two A1 lessons', async () => {
  for (const previous of ['a1/day-08', 'a1/day-09']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, `lessons/${previous}.html`), 'utf8')).screens.filter(s => s.block > 0));
    assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s)), [], previous);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
