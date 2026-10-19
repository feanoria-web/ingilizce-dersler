import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createDictionary, instrumentWordLookup, lessonVocabulary, normalizeTerm } from '../scripts/inject-word-lookup.mjs';
import { instrumentHtml } from '../scripts/inject-access.mjs';
import { instrumentAssessments } from '../scripts/instrument-assessments.mjs';

const fixture = `<html><head><script id="lesson-meta" type="application/json">{"title":"Demo"}</script></head><body><main>My family is friendly.</main><script>const LESSON = {vocab:[{items:[['family','aile','My family is here.'],['happy · sad','mutlu · üzgün','I am happy.'],['need · want · know','grammar label','I need help.']]}]};</script></body></html>`;

test('dictionary extracts paired translations without assigning a grammar note to unrelated words', () => {
  assert.equal(lessonVocabulary(fixture).length, 1);
  const dictionary = createDictionary(fixture, { friend: {meaning:'arkadaş',example:'She is my friend.'} });
  assert.equal(dictionary.family.meaning, 'aile');
  assert.equal(dictionary.happy.meaning, 'mutlu');
  assert.ok(!dictionary.sad, 'a happy sentence is not reused as an example of sad');
  assert.ok(!dictionary.need);
  assert.ok(!dictionary.want);
  assert.equal(dictionary.friend.example, 'She is my friend.');
  assert.equal(normalizeTerm('  I’m  '), "i'm");
  assert.equal(normalizeTerm('şifre'), '');
});

test('a grouped example cannot replace a correct curated example or create a truncated expression', () => {
  const source = `<html><head></head><body><script>const LESSON={vocab:[{items:[['happy · sad','mutlu · üzgün','I am happy.'],['in a good / bad mood','keyfi yerinde / keyifsiz','I am in a good mood.']]}]};</script></body></html>`;
  const dictionary = createDictionary(source,{sad:{meaning:'üzgün',example:'She is sad today.',exampleTr:'O bugün üzgün.'}});
  assert.equal(dictionary.sad.example,'She is sad today.');
  assert.equal(dictionary.sad.exampleTr,'O bugün üzgün.');
  assert.ok(!dictionary['in a good']);
  assert.ok(!dictionary['bad mood']);
});

test('published lookup is versioned, idempotent, and added automatically to future lessons', () => {
  const html = instrumentWordLookup(fixture, 'lessons/a2/future/day-06.html', {versions:{'word-lookup.js':'abc123','word-lookup.css':'def456'}});
  assert.match(html, /\.\.\/\.\.\/\.\.\/assets\/word-lookup\.js\?v=abc123/);
  assert.match(html, /word-lookup\.css\?v=def456/);
  assert.equal((html.match(/id="english-word-lookup-data"/g)||[]).length, 1);
  assert.equal(instrumentWordLookup(html, 'lessons/a2/future/day-06.html'), html);
  assert.equal(instrumentWordLookup(fixture, 'lessons/yds/grammar-studio.html'), fixture);
  assert.equal(instrumentWordLookup(fixture.replace('"title":"Demo"','"title":"Demo","wordLookup":false'),'lessons/a1/demo.html'),fixture.replace('"title":"Demo"','"title":"Demo","wordLookup":false'));
  assert.throws(() => instrumentWordLookup(fixture,'../outside.html'));
});

test('inline dictionary JSON cannot terminate its script element', () => {
  const html = instrumentWordLookup('<html><head></head><body></body></html>', 'lessons/b1/demo.html', {common:{ safe:{meaning:'güvenli',example:'safe <x data="</script><script>bad"> example'} }});
  const block=html.match(/<script id="english-word-lookup-data" type="application\/json">([\s\S]*?)<\/script>/)[1];
  assert.equal(JSON.parse(block).safe.meaning,'güvenli');
  assert.ok(!block.includes('<'));
});

test('each new actual lesson receives its own vocabulary and retains a complete access guard', async () => {
  const common=JSON.parse(await fs.readFile(new URL('../word-lookup/common.json',import.meta.url),'utf8'));
  assert.ok(Object.keys(common).length >= 200);
  for (const entry of Object.values(common)) {
    assert.ok(entry.meaning.trim()); assert.ok(entry.example.trim());
  }
  for (const [file,expected] of [['a1/day-03.html','family'],['a2/day-04.html','nervous'],['b1/day-05.html','plumber']]) {
    const source=await fs.readFile(new URL('../lessons/'+file,import.meta.url),'utf8');
    assert.ok(lessonVocabulary(source).length >= 5,file);
    const dictionary=createDictionary(source,common);
    assert.ok(dictionary[expected]?.meaning,file+' '+expected);
    const relative='lessons/'+file;
    const published=instrumentHtml(instrumentWordLookup(instrumentAssessments(source,relative).html,relative,{common}),relative);
    assert.match(published,/id="english-access-guard"/);
    assert.match(published,/id="english-assessment-bridge"/);
    assert.match(published,/id="english-word-lookup-script"/);
    assert.ok(!source.includes('english-word-lookup-data'),'offline lesson remains standalone');
  }
});
