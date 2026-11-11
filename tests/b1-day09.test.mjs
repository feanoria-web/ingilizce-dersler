import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {loadDay09,renderDay09,validateDay09} from '../scripts/build-b1-day09.mjs';
import {readStudyLesson} from '../scripts/b1-study.mjs';
import {instrumentAssessments} from '../scripts/instrument-assessments.mjs';
import {instrumentBreakReview,componentPages} from '../scripts/inject-break-review.mjs';
import {instrumentLearning} from '../scripts/instrument-learning.mjs';
import {assertPublicLessonHtml} from '../scripts/extract-teacher-guides.mjs';

const PATH='lessons/b1/day-09.html';
const data=await renderDay09();
const lesson=readStudyLesson(data.html);
const main=lesson.screens.filter(screen=>screen.block>0&&screen.type!=='break'&&!screen.extra);

test('B1 day09 keeps a coherent three-hour exhibition story with all four requested tenses',()=>{
  assert.equal(lesson.meta.level,'B1');
  assert.equal(lesson.meta.day,'DAY 09');
  assert.equal(lesson.meta.minutes,180);
  assert.equal(main.length,16);
  for(const number of [1,2,3])assert.equal(main.filter(screen=>screen.block===number).reduce((sum,screen)=>sum+screen.min,0),60);
  for(const tense of ['Present Continuous','Past Simple','Past Continuous','Past Perfect'])assert.ok(lesson.grammarTargets.some(row=>row[0]===tense),tense);
  const story=JSON.stringify(main);
  for(const name of ['Elif','Mert','Zeynep','Nermin'])assert.ok(story.includes(name),name);
  assert.ok(!/57th Regiment|09\.05|Address to Youth|Dear Atatürk|minute of silence/.test(story),'the exhibition is a new lesson, not a replay of the special');
  assert.match(data.html,/hudavendigar-b1-day-09-2026/);
  assert.ok(!data.html.includes('hudavendigar-b1-day-08-2026'));
});

test('breaks follow the first two completed blocks and recap only real teaching pages',()=>{
  const breaks=lesson.screens.filter(screen=>screen.type==='break');
  assert.deepEqual(breaks.map(screen=>[screen.id,screen.block,screen.min]),[['break1',1,10],['break2',2,10]]);
  for(const pause of breaks){const index=lesson.screens.indexOf(pause);assert.equal(lesson.screens[index-1].block,pause.block);assert.equal(lesson.screens[index+1].block,pause.block+1);}
  const pages=componentPages(data.html);
  assert.equal(pages.length,main.length);
  assert.ok(pages.every(page=>main.some(screen=>screen.id===page.id)));
  assert.ok(pages.every(page=>page.summary.length),'each teaching page contributes real recap material');
  for(const block of [1,2,3])assert.ok(pages.some(page=>main.find(screen=>screen.id===page.id)?.block===block&&page.examples.some(example=>example.tr)),'each block has bilingual examples in its recap material');
});

test('source and summary pages preserve the difference between the fictional notebook and verified history',()=>{
  const source=lesson.screens.find(screen=>screen.id==='sources');
  assert.equal(source.block,0);
  const text=JSON.stringify(source);
  assert.match(text,/1933/);
  assert.match(text,/gerçek bir arşiv belgesi/);
  for(const host of ['dosim.ktb.gov.tr','ataturkansiklopedisi.gov.tr'])assert.ok(text.includes(host));
  const summary=lesson.screens.find(screen=>screen.id==='summary');
  const links=summary.sections.filter(section=>section.type==='boxHead').map(section=>section.go);
  for(const screen of main.filter(screen=>screen.sections.some(section=>section.type==='explain')))assert.ok(links.includes(screen.id),screen.id);
  assert.equal(lesson.teacherNotes.length,0);
  assert.ok(assertPublicLessonHtml(data.html,'b1/day-09'));
});

test('source validation rejects bad screen, question, blank and component references before publication',()=>{
  const raw=structuredClone(data.lesson);
  const changes=[
    draft=>{draft.screens[1].id=draft.screens[0].id;},
    draft=>{draft.screens.find(screen=>screen.type==='break').min=1;},
    draft=>{draft.screens.flatMap(screen=>screen.sections||[]).find(section=>section.type==='choice').items[0].a=99;},
    draft=>{draft.screens.flatMap(screen=>screen.sections||[]).find(section=>section.type==='gap').items[0].a=[];},
    draft=>{draft.screens[0].sections.push({type:'missing-renderer'});},
    draft=>{draft.teacherNotes.push({text:'private notes'});},
  ];
  for(const change of changes){const draft=structuredClone(raw);change(draft);assert.throws(()=>validateDay09(draft,data.template));}
});

test('optional spoken models keep the transcript closed while the speech button is available',()=>{
  const model=lesson.screens.flatMap(screen=>screen.sections||[]).find(section=>section.type==='modelHidden'&&section.listen);
  assert.ok(model,'at least one spoken model');
  const start=data.template.indexOf('  R.modelHidden = '),end=data.template.indexOf('\n',start);
  assert.ok(start>0&&end>start);
  const context={R:{},revealBtn:()=>'<button data-show>Metni göster</button>',sayBtn:()=>'<button data-say>Sesli oku</button>'};
  vm.runInNewContext(data.template.slice(start,end),context);
  const html=context.R.modelHidden(model);
  assert.ok(html.indexOf('data-say')<html.indexOf('class="ans"'));
  assert.ok(html.includes('data-show'));
  assert.ok(!html.includes('class="ans show"'));
});

test('native answer normalization accepts past-perfect contractions without accepting an incorrect participle',()=>{
  const start=data.template.indexOf('  function norm(s) {'),end=data.template.indexOf('  const seeded = ',start);
  const context={};
  vm.runInNewContext(data.template.slice(start,end)+'\nthis.checkAnswer=accepts;this.normalizeAnswer=norm;',context);
  for(const [typed,expected]of [
    ['We’d saved the files.','We had saved the files.'],
    ["We'd already found it.",'We had already found it.'],
    ['We’d read the letter.','We had read the letter.'],
    ['We hadn’t saved it.','We had not saved it.'],
    ["They weren't sorting photos.",'They were not sorting photos.'],
    ['They weren’t sorting photos.','They were not sorting photos.'],
    ["I'd like a copy.",'I would like a copy.'],
  ])assert.equal(context.checkAnswer(typed,expected),true,typed);
  assert.equal(context.checkAnswer('We had saving the files.','We had saved the files.'),false);
  assert.equal(context.checkAnswer('We would saved the files.','We had saved the files.'),false);
});

test('navigation uses teaching-step numbers across breaks and exposes no teacher shortcut',()=>{
  const nav={innerHTML:''},select={innerHTML:''};
  const start=data.template.indexOf('  function screenNum(i) {'),end=data.template.indexOf('  function updateNav()',start);
  const context={S:lesson.screens,LESSON:lesson,isExtra:screen=>Boolean(screen.extra),esc:String,$:selector=>selector==='#lesson-nav'?nav:select};
  vm.runInNewContext(data.template.slice(start,end)+'\nbuildNav();this.numberFor=screenNum;',context);
  for(const step of [7,12,16]){
    const index=lesson.screens.findIndex(screen=>screen.step===step&&screen.block>0&&!screen.extra);
    const label=String(step).padStart(2,'0');
    assert.equal(context.numberFor(index),label);
    assert.ok(select.innerHTML.includes(`<option value="${index}">${label} ·`));
    assert.ok(nav.innerHTML.includes(`data-i="${index}"><span class="nav-num">${label}</span>`));
  }
  assert.ok(!data.html.includes('teacher-toggle'));
  assert.ok(!data.html.includes('<kbd>T</kbd>'));
  assert.ok(!data.html.includes('e.key === "T"'));
});

test('the new lesson retains native grading and break/learning bridges after full publication transforms',()=>{
  const assessment=instrumentAssessments(data.html,PATH);
  assert.ok(assessment.coverage.hooks.includes('instant-choice'));
  assert.ok(assessment.coverage.hooks.includes('gap-fill'));
  assert.ok(assessment.coverage.hooks.includes('sentence-rewrite'));
  const published=instrumentLearning(instrumentBreakReview(assessment.html,PATH),PATH);
  for(const marker of ['english-assessment-bridge','english-break-review-script','english-learning-page-bridge'])assert.ok(published.includes(`id="${marker}"`));
  for(const [,attrs,code]of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/application\/(json|ld\+json)/.test(attrs)&&code.trim())new vm.Script(code);
});
