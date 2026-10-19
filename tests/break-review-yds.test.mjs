import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {ydsPages,instrumentYdsBreakReview} from '../scripts/break-review-yds.mjs';

const source=await fs.readFile(new URL('../lessons/yds/grammar-studio.html',import.meta.url),'utf8');

test('YDS recap uses all123topics in order with source rules and correct bilingual examples',()=>{
  const pages=ydsPages(source);
  assert.equal(pages.length,123);
  assert.equal(new Set(pages.map(page=>page.id)).size,123);
  assert.equal(pages[0].id,'u01-s01');
  assert.equal(pages.at(-1).unitId,'u12');
  assert.ok(pages.every((page,index)=>page.index===index&&page.summary.length>0&&page.examples.every(example=>example.en&&example.tr)));
  assert.match(pages[0].summary.join(' '),/subject \+ verb/);
  assert.equal(pages[0].examples[0].en,'The archive is accessible to researchers.');
  assert.ok(!JSON.stringify(pages).includes('kendi notum'));
});

test('YDS break page keeps controls out of global navigation and registers scoped target',()=>{
  const output=instrumentYdsBreakReview(source);
  assert.match(output,/case 'breakreview':html=breakReviewPage\(\);break;/);
  assert.match(output,/getBreakTarget:\(\)=>currentRoute\?\.view==='breakreview'\?document.getElementById\('yds-break-review-target'\):null/);
  assert.match(output,/href="#breakreview">☕ Mola sayfasına geç/);
  assert.match(output,/getIndex:breakReviewIndex/);
  const nav=output.match(/<nav id="main-nav"[\s\S]*?<\/nav>/)[0];
  assert.ok(!nav.includes('breakreview'));
  assert.equal(instrumentYdsBreakReview(output),output);
  for(const [,attrs,code] of output.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if(!/application\/(json|ld\+json)/.test(attrs)&&code.trim()) new vm.Script(code);
});

test('YDS break cutoff starts at the last topic and offers all topics without revealing private notes',()=>{
  const output=instrumentYdsBreakReview(source);
  const bridge=output.slice(output.indexOf('  /* english-break-review-yds-adapter */'),output.indexOf('  function route() {'));
  const pages=ydsPages(source);
  const state={last:{unitId:'u02',sectionId:pages[23].id},notes:{[pages[23].id]:'PRIVATE NOTE MUST NOT BE READ'}};
  const api=new vm.Script(bridge+'\n({index:breakReviewIndex,page:breakReviewPage,choose:value=>{breakReviewCutoff=value;}});').runInNewContext({state,pageHead:()=>'',esc:String});
  assert.equal(api.index(),23);
  assert.equal((api.page().match(/<option /g)||[]).length,123);
  assert.match(api.page(),/value="23" selected/);
  assert.ok(!api.page().includes('PRIVATE NOTE MUST NOT BE READ'));
  api.choose(122);
  assert.equal(api.index(),122);
  assert.match(api.page(),new RegExp('href="#unit/u12/'+pages.at(-1).id+'"'));
  state.last={sectionId:'invalid'};
  api.choose(null);
  assert.equal(api.index(),0);
});

test('YDS source changes fail closed so a broken route cannot silently ship',()=>{
  assert.throws(()=>instrumentYdsBreakReview(source.replace("case 'test':html=testPage();break;","case 'test':html=testPage();return;")),/render route anchor changed/);
  assert.throws(()=>ydsPages('<html></html>'),/study-data is missing/);
});
