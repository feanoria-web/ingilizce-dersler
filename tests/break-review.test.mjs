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

test('A2 component recaps retain exact source indices and exclude breaks/resources',async()=>{
  for(const file of ['day-02','a1-review','day-04']){
    const source=await fs.readFile(new URL(`../lessons/a2/${file}.html`,import.meta.url),'utf8');
    const pages=componentPages(source);
    assert.ok(pages.length>=15,file);
    assert.ok(pages.every(p=>p.summary.length>0 && p.index>=0),file);
    assert.ok(!pages.some(p=>/^break\d*$/.test(p.id)),file);
    assert.ok(!pages.some(p=>['plan','vocab','diagnosis','cheatsheet'].includes(p.id)),file);
    const output=instrumentBreakReview(source,`lessons/a2/${file}.html`,{versions:{'break-review.js':'abc','break-review.css':'def'}});
    assert.match(output,/break-review\.js\?v=abc/);
    assert.match(output,/getIndex:\(\)=>st.idx,timer/);
    assert.equal(instrumentBreakReview(output,`lessons/a2/${file}.html`),output);
    for(const [,attrs,code] of output.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
  }
});

test('both A2 board lessons register after their complete slide deck is initialized',async()=>{
  for(const file of ['day-01','practice']) {
    const source=await fs.readFile(new URL(`../lessons/a2/${file}.html`,import.meta.url),'utf8');
    const output=instrumentBreakReview(source,`lessons/a2/${file}.html`);
    assert.match(output,/initializeBoard\(\);\s*;window.EnglishBreakReview\?\.register/);
    assert.match(output,/pages:boardSlides\.flatMap/);
    assert.match(output,/state.mode==='board'\?boardIndex/);
    for(const [,attrs,code] of output.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/application\/(json|ld\+json)/.test(attrs) && code.trim()) new vm.Script(code);
  }
});

test('this urgent release changes A2 only and rejects paths outside the site',()=>{
  const source='<html><head></head><body></body></html>';
  for(const file of ['lessons/a1/day-03.html','lessons/b1/day-05.html','lessons/yds/grammar-studio.html']) assert.equal(instrumentBreakReview(source,file),source);
  assert.throws(()=>instrumentBreakReview(source,'../lessons/a2/outside.html'));
});
