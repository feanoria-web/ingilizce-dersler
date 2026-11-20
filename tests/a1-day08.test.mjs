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
const LESSON = 'lessons/a1/day-08.html';
const source = await fs.readFile(path.join(ROOT, LESSON), 'utf8');
const lesson = readStudyLesson(source);
const sentences = screens => {
  const out = new Set();
  const walk = v => { if (typeof v === 'string') { for (const s of v.replace(/<[^>]+>/g, '').replace(/\{[a-z]\|([^}]*)\}/g, '$1').split(/(?<=[.?!])\s+/)) if (s.length > 24 && /^[A-Z]/.test(s)) out.add(s.trim()); } else if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
  walk(screens);
  return out;
};
const sections = type => lesson.screens.flatMap(s => (s.sections || []).filter(x => x.type === type));
const TEACHING = ['head-to-toe', 'hand', 'senses', 'face', 'organs', 'matter', 'hair-eyes', 'whose', 'people-opposites', 'compare-people', 'animal-bodies', 'about-me'];

test('the A1 body lesson has four parts and weaves the other topics of the row into the body theme', () => {
  assert.equal(lesson.meta.level, 'A1');
  assert.deepEqual(lesson.blocks.map(b => b.minutes), [50, 50, 50, 60]);
  for (const block of lesson.blocks) assert.equal(lesson.screens.filter(s => s.block === block.n && !s.extra && s.type !== 'break').reduce((sum, s) => sum + s.min, 0), block.minutes, `block ${block.n}`);
  const ids = lesson.screens.map(s => s.id);
  for (const id of TEACHING) assert.ok(ids.includes(id), id);
  for (const screen of lesson.screens.filter(s => s.block > 0 && !s.extra && s.type !== 'break' && !['warm', 'close'].includes(s.id))) assert.ok(screen.sections.some(x => x.type === 'explain' && /^Konu anlatımı/.test(x.title)), `${screen.id}: topic explanation`);
  const text = JSON.stringify(lesson);
  // body, organs, appearance; plus colours, pronouns, opposites and synonyms, comparing, favourite animal, places
  for (const phrase of ['This is my left hand', 'index finger', 'We see with our eyes', 'The heart is in the chest', 'kidneys', 'My head hurts', 'the dentist\'s', 'What colour is her hair', 'Hers is brown', 'Another word for', 'The opposite of', 'taller than', 'My favourite animal is', 'its trunk', 'All about me']) assert.ok(text.includes(phrase), phrase);
  assert.equal(lesson.teacherNotes.length, 0);
  assert.ok(assertPublicLessonHtml(source, 'a1/day-08'));
});

test('every labelled picture is drawn in the lesson and every label has a point on its picture', () => {
  const maps = sections('bodyMap');
  assert.deepEqual([...new Set(maps.map(m => m.pic))].sort(), ['body', 'cat', 'face', 'hand', 'organs']);
  for (const m of maps) for (const [k, word] of m.items) {
    assert.match(source, new RegExp(`(?:\\b|")${k}"?: \\[\\d`), `${m.pic}: ${k}`);
    assert.match(word, /^[a-z ]+$/);
  }
  const words = new Set(maps.flatMap(m => m.items.map(([, w]) => w)));
  assert.ok(words.size >= 45, `${words.size} labelled words`);
  for (const renderer of ['bodyMap', 'looks', 'colourIn', 'colourFace', 'lineup']) assert.ok(source.includes(`R.${renderer} = `), renderer);
  assert.ok(source.includes('BM_ART.hand = ') && source.includes('BM_ART.cat = '));
  assert.ok(!/<img\b[^>]*src="https?:/i.test(source), 'no external pictures are needed');
});

test('the listen-and-colour clown has an answer for every part and the text names each colour', () => {
  const [face] = sections('colourFace');
  assert.ok(face);
  assert.deepEqual(Object.keys(face.key).sort(), [...face.objects].sort());
  const transcript = JSON.stringify(lesson.screens.find(s => s.id === 'hair-eyes').sections.find(x => x.type === 'modelHidden'));
  for (const [part, colour] of Object.entries(face.key)) assert.match(transcript, new RegExp(`${colour} ${part}|${part}[^.!]*\\b${colour}\\b`, 'i'), `${part} → ${colour}`);
});

test('portraits match their descriptions and the height line-up agrees with its exercise', () => {
  for (const look of sections('looks')) for (const p of look.people) {
    if (p.glasses) assert.match(p.text, /glasses/, p.name);
    if (p.beard) assert.match(p.text, /beard/, p.name);
    if (p.moustache) assert.match(p.text, /moustache/, p.name);
    if (p.hair === 'bald') assert.match(p.text, /bald/, p.name);
    if (p.hair && p.hair !== 'bald') assert.match(p.text, new RegExp(p.hc), p.name);
    if (p.h === 'tall' || p.h === 'short') assert.match(p.text, new RegExp(`\\b${p.h}\\b`), p.name);
  }
  const [line] = sections('lineup');
  const cm = Object.fromEntries(line.people.map(p => [p.name, p.cm])), age = Object.fromEntries(line.people.map(p => [p.name, Number(p.age.replace(/\D/g, ''))]));
  assert.ok(cm.Owen > cm.Chloe && cm.Finn < cm.Chloe && cm['Mr Reed'] > cm.Owen && cm.Nora > cm.Chloe && cm.Nora < cm.Owen);
  assert.ok(age.Chloe > age.Finn && age.Owen < age.Nora && age['Mr Reed'] > age.Nora);
  assert.equal(cm['Mr Reed'] - cm.Nora, 26);
});

test('every teaching screen has a reading or listening, a class activity and a research task', () => {
  for (const id of TEACHING) {
    const screen = lesson.screens.find(s => s.id === id);
    assert.ok(screen.sections.some(x => x.type === 'reading' || (x.type === 'callout' && /^Dinleme/.test(x.title))), `${id}: reading or listening`);
    assert.ok(screen.sections.some(x => x.type === 'activity'), `${id}: class activity`);
    assert.ok(screen.sections.some(x => x.type === 'inputTable' && /^Araştıralım/.test(x.title)), `${id}: research`);
    assert.ok(screen.sections.length >= 10, `${id}: ${screen.sections.length} sections`);
  }
  assert.ok(sections('reading').length >= 10);
  assert.ok(sections('callout').filter(x => /^Dinleme/.test(x.title)).length >= 10);
  const media = lesson.screens.find(s => s.id === 'media');
  assert.ok(media && lesson.homeLinks.some(([id]) => id === 'media'));
  for (const [, url] of JSON.stringify(media).matchAll(/href=\\"([^"\\]+)\\"/g)) assert.match(url, /^https:\/\/(www\.youtube\.com\/watch\?v=[\w-]{11}|learnenglishkids\.britishcouncil\.org\/)/);
});

test('the lesson does not copy sentences from the previous two A1 lessons', async () => {
  for (const previous of ['a1/day-06', 'a1/day-07']) {
    const before = sentences(readStudyLesson(await fs.readFile(path.join(ROOT, `lessons/${previous}.html`), 'utf8')).screens.filter(s => s.block > 0));
    assert.deepEqual([...sentences(lesson.screens.filter(s => s.block > 0))].filter(s => before.has(s)), [], previous);
  }
});

test('the lesson keeps working after publication instrumentation', () => {
  const published = instrumentLearning(instrumentBreakReview(instrumentAssessments(source, LESSON).html, LESSON), LESSON);
  for (const [, attrs, code] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
});
