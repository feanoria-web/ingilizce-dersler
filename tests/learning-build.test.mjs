import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {instrumentLearning} from '../scripts/instrument-learning.mjs';
import {instrumentAssessments} from '../scripts/instrument-assessments.mjs';
import {instrumentBreakReview} from '../scripts/inject-break-review.mjs';

test('all 18 published lesson families load versioned static learning metadata without changing source lessons',async()=>{
  let count=0;
  for(const level of ['a1','a2','b1','yds'])for(const file of await fs.readdir(new URL(`../lessons/${level}/`,import.meta.url))){
    if(!file.endsWith('.html'))continue;
    const path=`lessons/${level}/${file}`,source=await fs.readFile(new URL('../'+path,import.meta.url),'utf8');
    const withBreaks=instrumentBreakReview(instrumentAssessments(source,path).html,path);
    const published=instrumentLearning(withBreaks,path,{versions:{'learning-page-bridge.js':'new123','assessment-bridge.js':'new456'}});
    assert.match(published,/learning-page-bridge\.js\?v=new123/);assert.match(published,/assessment-bridge\.js\?v=new456/);
    assert.match(published,/EnglishLearningPageBridge\?\.register(Component|Board|Yds)/);
    assert.equal(instrumentLearning(published,path),published);assert.ok(!source.includes('english-learning-page-bridge'));
    for(const [,attrs,script] of published.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi))if(!/application\/(json|ld\+json)/i.test(attrs)&&script.trim())new vm.Script(script);
    count++;
  }
  assert.equal(count,19);
});

test('component metadata excludes break/resources and connects exact per-question IDs and topics',async()=>{
  const source=await fs.readFile(new URL('../assets/learning-page-bridge.js',import.meta.url),'utf8');
  const calls=[],window={EnglishAssessment:{observe:(...args)=>calls.push(args)}};
  vm.runInNewContext(source,{window});
  let index=0;const binders={choice(){},gap(){}};
  const screens=[{id:'be',title:'be: am / is / are',block:1,sections:[{type:'choice',items:[{q:'I ___ here.',a:0}]}]},{id:'break1',block:1,type:'break'},{id:'teacher',block:0,sections:[]}];
  window.EnglishLearningPageBridge.registerComponent({screens,getIndex:()=>index,binders,key:(s,k,i,j)=>[s.id,k,i,j].filter(x=>x!==undefined).join('.')});
  assert.equal(window.EnglishLessonProgress.snapshot().totalPages,1);assert.equal(window.EnglishLessonProgress.snapshot().questionCount,1);
  index=1;assert.equal(window.EnglishLessonProgress.snapshot().pageKind,'break');index=2;assert.equal(window.EnglishLessonProgress.snapshot().pageKind,'resource');
  const node={dataset:{i:'0'}},el={querySelectorAll:()=>[node]};
  binders.choice(el,screens[0].sections[0],screens[0],0);
  assert.equal(calls[0][1],'be.0.0');assert.equal(calls[0][2],'I ___ here.');assert.equal(calls[0][4].id,'grammar:be');
  binders.gap(el,{items:[{q:'I ___ here and she ___ there.',a:['am','is']}]},screens[0],1);
  assert.deepEqual(calls.slice(1).map(x=>x[1]),['be.1.0.0','be.1.0.1']);
});
