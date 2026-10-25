import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {componentPages,instrumentBreakReview,summarizeScreen} from '../scripts/inject-break-review.mjs';

test('recaps use correct examples and omit teacher notes and wrong options',()=>{
  const recap=summarizeScreen({title:'Demo',teacher:['Private teacher note'],sections:[{type:'stepper',steps:[{p:['<b>be</b> + sıfat'],en:'I am happy.',tr:'Mutluyum.'}]},{type:'trTrap',rows:[{wrong:'I happy.',right:'I am happy.',tr:'Mutluyum.'}]},{type:'choice',items:[{q:'She ___ here.',o:['is','are'],a:0,why:'she → is'}]}]});
  assert.ok(recap.summary.includes('be + sıfat'));
  assert.ok(recap.examples.some(x=>x.tr==='Mutluyum.'));
  assert.ok(!JSON.stringify(recap).includes('Private teacher note'));
  assert.ok(!JSON.stringify(recap).includes('I happy.'));
  assert.ok(!JSON.stringify(recap).includes('She are here.'));
});

test('all component recaps retain exact source indices and exclude breaks/resources',async()=>{
  for(const file of ['a1/day-01','a1/day-02','a1/day-03','a1/day-04','a2/day-02','a2/a1-review','a2/day-04','a2/day-05','b1/day-02','b1/day-03','b1/day-04','b1/day-05','b1/day-06']){
    const source=await fs.readFile(new URL(`../lessons/${file}.html`,import.meta.url),'utf8');
    const pages=componentPages(source);
    assert.ok(pages.length>=15,file);
    assert.ok(pages.every(p=>p.summary.length>0 && p.index>=0),file);
    assert.ok(!pages.some(p=>/^break\d*$/.test(p.id)),file);
    assert.ok(!pages.some(p=>['plan','vocab','diagnosis','cheatsheet'].includes(p.id)),file);
    const output=instrumentBreakReview(source,`lessons/${file}.html`,{versions:{'break-review.js':'abc','break-review.css':'def'}});
    assert.match(output,/break-review\.js\?v=abc/);
    assert.match(output,/getIndex:\(\)=>st.idx,getBreakTarget:\(\)=>S\[st.idx\]\?\.type==='break'/);
    assert.equal(instrumentBreakReview(output,`lessons/${file}.html`),output);
    for(const [,attrs,code] of output.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
  }
});

test('all board lessons register after their complete slide deck is initialized and gate the entry to actual breaks',async()=>{
  for(const file of ['a2/day-01','a2/practice','b1/day-01','b1/practice']) {
    const source=await fs.readFile(new URL(`../lessons/${file}.html`,import.meta.url),'utf8');
    const output=instrumentBreakReview(source,`lessons/${file}.html`);
    assert.match(output,/initializeBoard\(\);\s*;window.EnglishBreakReview\?\.register/);
    assert.match(output,/pages:boardSlides\.flatMap/);
    assert.match(output,/state.mode==='board'\?boardIndex/);
    assert.match(output,/boardSlides\[boardIndex\]\?\.tag==='BREAK'\?document.querySelector\('#board-content'\):null/);
    if(file==='b1/practice') {
      assert.match(output,/lesson.splice\(lesson.findIndex\(l=>l\[0\]==='5'\)/);
      assert.match(output,/lesson.splice\(lesson.findIndex\(l=>l\[0\]==='10'\)/);
      assert.match(output,/ACTIVITIES\[id\]=\(\)=>panel\('Mola'/);
    }
    for(const [,attrs,code] of output.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
  }
});

test('instrumentation is limited to lesson pages and rejects paths outside the site',()=>{
  const source='<html><head></head><body></body></html>';
  for(const file of ['index.html','admin.html','login.html']) assert.equal(instrumentBreakReview(source,file),source);
  assert.throws(()=>instrumentBreakReview(source,'../lessons/a2/outside.html'));
});
