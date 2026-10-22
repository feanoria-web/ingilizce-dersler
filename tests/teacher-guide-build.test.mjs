import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {
  assertPublicLessonHtml,
  sanitizeLessonHtml,
  normalizeTeacherGuideBundle,
} from '../scripts/extract-teacher-guides.mjs';

const marker='<meta name="teacher-guides" content="private-v1">';
const page=(script,{marked=false,body=''}={})=>`<!doctype html><html><head>${marked?marker:''}</head><body>${body}<script>${script}</script></body></html>`;
const lessonFixture=()=>({
  meta:{title:'Student lesson',teacher:'The teacher'},
  screens:[{
    id:'practice',block:1,title:'Ask your teacher a question',
    teacher:['PRIVATE_SCREEN_NOTE_SENTINEL'],stages:[['PRIVATE_STAGE_SENTINEL',3]],
    sections:[
      {type:'explain',title:'Student examples',paras:['PUBLIC_EXAMPLE_SENTINEL'],note:'PUBLIC_GENERIC_NOTE_SENTINEL'},
      {type:'activity',prep:'PRIVATE_PREP_SENTINEL',tip:'PRIVATE_TIP_SENTINEL',steps:['PUBLIC_ACTIVITY_STEP_SENTINEL']},
      {type:'activity',prep:'PRIVATE_SECOND_PREP_SENTINEL',steps:['PUBLIC_SECOND_ACTIVITY_STEP_SENTINEL']},
      {type:'mcq',items:[{q:'PUBLIC_QUESTION_SENTINEL',o:['is','are'],a:1,why:'PUBLIC_ANSWER_EXPLANATION_SENTINEL'}]},
    ],
  },{
    id:'guide',block:0,title:'Teacher guide',lead:'PRIVATE_GUIDE_SENTINEL',
    sections:[{type:'explain',paras:['PRIVATE_GUIDE_DETAIL_SENTINEL']}],
  },{
    id:'observe',block:0,title:'Observation grid',sections:[{type:'diagnosis',rows:[['PRIVATE_GRID_SENTINEL']]}],
  }],
  homeLinks:[['guide','Teacher guide'],['observe','Observation grid'],['vocab','Phrase bank']],
  teacherNotes:[['Planning','PRIVATE_GLOBAL_NOTE_SENTINEL']],smallClass:['PRIVATE_MANAGEMENT_SENTINEL'],
});
const cleanLesson=()=>({meta:{title:'Public lesson'},screens:[{id:'practice',block:1,sections:[]}],teacherNotes:[],smallClass:[]});
const lessonPage=(lesson,options)=>page(`const LESSON = ${JSON.stringify(lesson)};`,options);
function dataFrom(html,name){
  const source=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].find(match=>match[1].includes(`const ${name}`))?.[1];
  assert.ok(source,`${name} fixture script must remain available`);
  return JSON.parse(vm.runInNewContext(`${source}\nJSON.stringify(${name})`,{}, {timeout:1000}));
}

test('component extraction preserves private instructions separately and keeps student examples, questions and explanations',()=>{
  const original=lessonFixture(),result=sanitizeLessonHtml(lessonPage(original),'a1/synthetic');
  assert.equal(result.changed,true);
  assert.equal(result.guide.id,'a1/synthetic');
  const privateOutput=JSON.stringify(result.guide);
  for(const sentinel of [
    'PRIVATE_SCREEN_NOTE_SENTINEL','PRIVATE_STAGE_SENTINEL','PRIVATE_PREP_SENTINEL',
    'PRIVATE_SECOND_PREP_SENTINEL','PRIVATE_TIP_SENTINEL','PRIVATE_GUIDE_SENTINEL',
    'PRIVATE_GUIDE_DETAIL_SENTINEL','PRIVATE_GRID_SENTINEL','PRIVATE_GLOBAL_NOTE_SENTINEL',
    'PRIVATE_MANAGEMENT_SENTINEL',
  ]){
    assert.ok(privateOutput.includes(sentinel),`${sentinel} must survive in the private guide`);
    assert.ok(!result.html.includes(sentinel),`${sentinel} must leave the public payload`);
  }
  const publicData=dataFrom(result.html,'LESSON'),student=publicData.screens[0];
  assert.deepEqual(publicData.screens.map(screen=>screen.id),['practice']);
  assert.deepEqual(publicData.homeLinks,[['vocab','Phrase bank']]);
  assert.equal(publicData.meta.teacher,'The teacher');
  assert.equal(student.title,'Ask your teacher a question');
  assert.deepEqual(student.sections[0],original.screens[0].sections[0]);
  assert.deepEqual(student.sections[1].steps,['PUBLIC_ACTIVITY_STEP_SENTINEL']);
  assert.deepEqual(student.sections[2].steps,['PUBLIC_SECOND_ACTIVITY_STEP_SENTINEL']);
  assert.deepEqual(student.sections[3],original.screens[0].sections[3]);
  assert.equal(new Set(result.guide.sections.map(section=>section.id)).size,result.guide.sections.length,'repeated preparation notes need distinct importable section IDs');
  assert.equal(assertPublicLessonHtml(result.html,'a1/synthetic'),true);
});

test('sanitization is idempotent and never returns private content from an already sanitized page',()=>{
  const first=sanitizeLessonHtml(lessonPage(lessonFixture()),'a1/synthetic');
  const second=sanitizeLessonHtml(first.html,'a1/synthetic');
  assert.equal(second.changed,false);
  assert.equal(second.guide,null);
  assert.equal(second.html,first.html);
  assert.equal(assertPublicLessonHtml(second.html,'a1/synthetic'),true);
});

test('legacy extraction removes source copies, teacher samples, inline notes and teacher attachments while preserving student work',()=>{
  const source={metadata:{title:'Legacy lesson',teacher:'The teacher'},lesson:[{title:'Activity',teacherNote:'PRIVATE_BOARD_NOTE_SENTINEL',steps:['PRIVATE_WORKFLOW_SENTINEL']}],
    readings:[{title:'PUBLIC_READING_SENTINEL',text:'Ask your teacher about this story.'}],
    placement:{questions:[{q:'PUBLIC_PLACEMENT_SENTINEL',options:['a','b'],answer:1}],bands:[{level:'PRIVATE_BAND_SENTINEL'}]},
    roleplay:{firstDay:{title:'Student conversation',steps:[{title:'PUBLIC_ROLEPLAY_STEP_SENTINEL',phrases:['Hello!']}]}},
    teacherGuidance:{instructions:'PRIVATE_GUIDANCE_SENTINEL'},sourceTexts:[{text:'PRIVATE_SOURCE_COPY_SENTINEL'}],
    studentSamples:[{teacherOnly:true,text:'PRIVATE_CALIBRATION_SENTINEL'}],
  };
  const teacherPdf=Buffer.from('PRIVATE_ATTACHMENT_BYTES_SENTINEL').toString('base64');
  const publicPdf=Buffer.from('PUBLIC_ATTACHMENT_BYTES_SENTINEL').toString('base64');
  const printables=[{base:'Student-practice',title:'Student worksheet',pdf:`data:application/pdf;base64,${publicPdf}`},
    {base:'Teacher-key',title:'Öğretmen anahtarı',pdf:`data:application/pdf;base64,${teacherPdf}`}];
  const script=`const DATA=${JSON.stringify(source)};const PRINTABLES=${JSON.stringify(printables)};
    function note(value){return value;}
    function studentView(){return 'PUBLIC_VIEW_SENTINEL'+note('PRIVATE_INLINE_NOTE_SENTINEL');}
    const slides=[{title:'PUBLIC_SLIDE_SENTINEL',note:'PRIVATE_SLIDE_NOTE_SENTINEL',answer:'PUBLIC_SLIDE_ANSWER_SENTINEL'}];`;
  const result=sanitizeLessonHtml(page(script),'a2/synthetic'),privateOutput=JSON.stringify(result.guide);
  for(const sentinel of ['PRIVATE_BOARD_NOTE_SENTINEL','PRIVATE_WORKFLOW_SENTINEL','PRIVATE_BAND_SENTINEL','PRIVATE_GUIDANCE_SENTINEL',
    'PRIVATE_SOURCE_COPY_SENTINEL','PRIVATE_CALIBRATION_SENTINEL','PRIVATE_INLINE_NOTE_SENTINEL','PRIVATE_SLIDE_NOTE_SENTINEL']){
    assert.ok(privateOutput.includes(sentinel));assert.ok(!result.html.includes(sentinel));
  }
  assert.ok(!result.html.includes(teacherPdf));assert.ok(result.html.includes(publicPdf));
  assert.deepEqual(result.guide.attachments,[{name:'Teacher-key.pdf',mime:'application/pdf',base64:teacherPdf}]);
  const publicData=dataFrom(result.html,'DATA');
  assert.deepEqual(publicData.readings,source.readings);
  assert.deepEqual(publicData.placement.questions,source.placement.questions);
  assert.deepEqual(publicData.roleplay,source.roleplay,'student roleplay steps are not teacher workflow');
  assert.ok(result.html.includes('PUBLIC_VIEW_SENTINEL'));
  assert.ok(result.html.includes('PUBLIC_SLIDE_ANSWER_SENTINEL'));
  assert.equal(assertPublicLessonHtml(result.html,'a2/synthetic'),true);
});

test('existing private-v1 markers cannot conceal reintroduced teacher data',async t=>{
  const cases=[
    ['guide screen',lesson=>lesson.screens.push({id:'guide',title:'Private guide',lead:'PRIVATE_REINTRO_SENTINEL'})],
    ['screen note',lesson=>lesson.screens[0].teacher=['PRIVATE_REINTRO_SENTINEL']],
    ['workflow stage',lesson=>lesson.screens[0].stages=[['PRIVATE_REINTRO_SENTINEL',1]]],
    ['activity preparation',lesson=>lesson.screens[0].sections.push({type:'activity',prep:'PRIVATE_REINTRO_SENTINEL'})],
    ['global notes',lesson=>lesson.teacherNotes=[['Private','PRIVATE_REINTRO_SENTINEL']]],
  ];
  for(const [label,mutate]of cases)await t.test(label,()=>{const lesson=cleanLesson();mutate(lesson);assert.throws(()=>assertPublicLessonHtml(lessonPage(lesson,{marked:true}),'marked-fixture'),/private teacher content/);});
  await t.test('legacy teacher-only samples',()=>{
    const html=page('const DATA={"metadata":{"title":"Public"},"studentSamples":[{"teacherOnly":true,"text":"PRIVATE_REINTRO_SENTINEL"}]};',{marked:true});
    assert.throws(()=>assertPublicLessonHtml(html,'legacy-marked-fixture'),/private teacher content/);
  });
});

test('marked lessons reject new inline notes, slide notes and teacher-mode shortcuts',async t=>{
  for(const [label,extra]of [
    ['note call','function note(value){return value;}const result=note("PRIVATE_SENTINEL");'],
    ['slide note','const slides=[{note:"PRIVATE_SENTINEL"}];'],
    ['template','const markup=`<aside class="teacher-panel">PRIVATE_SENTINEL</aside>`;'],
    ['teacher shortcut','let state={teacher:false};const teacherMode=state.teacher;'],
  ])await t.test(label,()=>{
    const html=page(`const LESSON=${JSON.stringify(cleanLesson())};${extra}`,{marked:true});
    assert.throws(()=>assertPublicLessonHtml(html,'inline-fixture'),/private teacher content/);
  });
});

test('unknown future lesson families cannot publish static teacher blocks or guide links',async t=>{
  for(const body of [
    '<section class="teacher-only"><p>PRIVATE_SENTINEL</p></section>',
    '<aside class="teacher-panel">PRIVATE_SENTINEL</aside>',
    '<div class="teacher-resource"><p>PRIVATE_SENTINEL</p></div>',
    '<section id="guide">PRIVATE_SENTINEL</section>',
    '<a href="#guide">Teacher guide</a>',
  ])await t.test(body.split('>')[0]+'>',()=>assert.throws(()=>assertPublicLessonHtml(page('',{body}),'unknown-family'),/private teacher content/));
});

test('the guard accepts ordinary student teacher mentions, generic explanatory notes and empty placeholders',()=>{
  const lesson=cleanLesson();lesson.screens[0].sections=[{type:'explain',title:'Ask the teacher',note:'Student explanation',examples:['The teacher is in the classroom.']}];
  assert.equal(assertPublicLessonHtml(lessonPage(lesson,{marked:true,body:'<p>Ask your teacher a question.</p><section class="teacher-panel"></section>'}),'public-fixture'),true);
  assert.equal(assertPublicLessonHtml(page('',{body:'<p>Our teacher teaches English.</p>'}),'unknown-public-family'),true);
});

test('section-ID normalization is stable and preserves source snapshots',()=>{
  const raw='<p>PRIVATE_SOURCE_SENTINEL</p>';
  const bundle={version:1,lessons:[{id:'a1/synthetic',title:'Private guide',sections:[
    {id:'steps',title:'First',content:['PRIVATE_FIRST_SENTINEL']},
    {id:'steps',title:'Second',content:{source:raw}},
  ]}]};
  normalizeTeacherGuideBundle(bundle);
  assert.deepEqual(bundle.lessons[0].sections.map(section=>section.id),['steps','steps-2']);
  assert.equal(bundle.lessons[0].sections[1].content.source,raw);
  assert.ok(bundle.lessons[0].sections[1].content.text.join(' ').includes('PRIVATE_SOURCE_SENTINEL'));
  const once=JSON.stringify(bundle);normalizeTeacherGuideBundle(bundle);assert.equal(JSON.stringify(bundle),once);
});
