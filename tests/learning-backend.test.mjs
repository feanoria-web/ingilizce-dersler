import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openDatabase} from '../backend/local-db.mjs';
import {handleRequest,importStudents} from '../backend/service.mjs';
import {passwordHash} from '../backend/crypto.mjs';
import {validateLearning,aggregateLearning} from '../backend/learning-insights.mjs';
const migrations=new URL('../backend/migrations/',import.meta.url);
const schema=(await Promise.all((await fs.readdir(migrations)).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFile(new URL(n,migrations),'utf8')))).join('\n');
const secret='Local-test!Learning-2026',hash=await passwordHash(secret);
async function request(env,path,{body,token}={}) {const r=await handleRequest(new Request('https://service.example'+path,{method:body?'POST':'GET',headers:{Origin:'https://school.example','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:r.headers.get('Content-Type')?.includes('json')?await r.json():await r.text()};}
async function setup(){const DB=openDatabase();DB.exec(schema);const env={DB,ADMIN_PASSWORD_HASH:hash,FRONTEND_ORIGIN:'https://school.example'};await importStudents(env,[{id:'a2-001',name:'Deniz Örnek',group:'A2'},{id:'a1-001',name:'Ece Deneme',group:'A1'}]);const student=(await request(env,'/api/auth/login',{body:{password:'Deniz Örnek'}})).data,admin=(await request(env,'/api/admin/login',{body:{password:secret}})).data;return {env,student,admin};}
const lesson='lessons/a2/day-04.html';
const context=(screenId='6')=>({tabId:crypto.randomUUID(),pagePath:lesson,pageTitle:'A2 Ders 4',screenId,screenTitle:'Present Simple',section:'Alıştırma',visibility:'visible',focused:true,idleSeconds:0,lastInteractionAt:new Date().toISOString(),interaction:'pointer',status:'working'});
const qLearning=(patch={})=>({kind:'question',questionId:'q-1',topicId:'present-simple',topicTitle:'Present Simple',wallSeconds:24,activeSeconds:18,timingScope:'question',helpUsed:false,hintUsed:false,answerRevealed:false,...patch});
const event=(type,learning,patch={})=>({eventId:crypto.randomUUID(),type,lesson,activity:'6',occurredAt:new Date().toISOString(),context:context(),...(learning?{learning}:{}),...patch});
const result=(outcome='incorrect',learning=qLearning())=>event('question_result',learning,{details:{questionId:'q-1',prompt:'She ___ to school.',selectedAnswer:outcome==='correct'?'goes':'go',correctAnswer:'goes',outcome,assessmentKind:'fill-blank'}});
const send=async(t,events)=>{const r=await request(t.env,'/api/events',{token:t.student.token,body:{events:Array.isArray(events)?events:[events]}});assert.equal(r.status,200,JSON.stringify(r.data));return r;};
const report=async(t,filter='')=>(await request(t.env,'/api/admin/learning'+filter,{token:t.admin.token})).data;
const page=(patch={})=>({kind:'page',visitId:crypto.randomUUID(),pageKind:'lesson',pageIndex:0,totalPages:2,viewSeconds:30,activeSeconds:12,...patch});
const progress=(patch={})=>({kind:'progress',pageKind:'lesson',pageIndex:0,totalPages:2,questionCount:1,answeredQuestionCount:1,completed:true,...patch});
const breakLearning=(patch={})=>({kind:'break',breakId:crypto.randomUUID(),durationMinutes:10,intervalSeconds:15,selectedPages:[{id:'6',title:'Present Simple'}],selectedCount:1,elapsedSeconds:0,pausedSeconds:0,endReason:null,...patch});

test('learning validation enforces event kinds, bounded measured durations and safe metadata',()=>{
 assert.equal(validateLearning(undefined,'question_result'),null);
 for(const patch of [{activeSeconds:25},{wallSeconds:-1},{wallSeconds:1.1},{timingScope:'unavailable'},{topicId:'<script>'},{questionId:''}])assert.throws(()=>validateLearning(qLearning(patch),'question_result'),e=>e.status===400);
 for(const prompt of ['x'.repeat(1501),'unsafe\u0000prompt',42])assert.throws(()=>validateLearning(qLearning({prompt}),'question_open'),e=>e.status===400);
 assert.throws(()=>validateLearning(qLearning(),'help_used'),e=>e.status===400);
 assert.throws(()=>validateLearning(qLearning(),'question_result',{questionId:'other'}),e=>e.status===400);
 assert.throws(()=>validateLearning(page({activeSeconds:31}),'page_summary'),e=>e.status===400);
 assert.throws(()=>validateLearning(progress({answeredQuestionCount:2}),'lesson_progress'),e=>e.status===400);
 assert.throws(()=>validateLearning(breakLearning({endReason:'early'}),'break_start'),e=>e.status===400);
 assert.throws(()=>validateLearning(breakLearning(),'break_end'),e=>e.status===400);
 const clean=validateLearning({...qLearning(),typedPassword:'DO NOT STORE',rawKeys:'private'},'question_result');assert.ok(!JSON.stringify(clean).includes('private'));assert.ok(!Object.hasOwn(clean,'typedPassword'));
});

test('opened unanswered questions expose their static human prompt without storing extra input',async()=>{
 const t=await setup();await send(t,event('question_open',qLearning()));await send(t,event('question_open',{...qLearning(),prompt:'Choose the correct form: She ___ to school.',typedAnswer:'PRIVATE INPUT'}));
 const r=await report(t),q=r.questions[0];assert.equal(q.prompt,'Choose the correct form: She ___ to school.');assert.equal(q.attemptCount,0);assert.equal(q.latestAttempt,null);assert.ok(!JSON.stringify(r).includes('PRIVATE INPUT'));
 const record=(await request(t.env,'/api/admin/logs?eventType=question_open',{token:t.admin.token})).data.events[0];assert.equal(record.learning.prompt,q.prompt);
 const csv=(await request(t.env,'/api/admin/logs.csv?eventType=question_open',{token:t.admin.token})).data;assert.match(csv,/Choose the correct form: She ___ to school\./);
 await send(t,result());assert.equal((await report(t)).questions[0].prompt,'She ___ to school.','result prompt becomes the canonical assessment wording');t.env.DB.close();
});

test('learning observations persist once, cannot be rewritten by replay, and remain server-assigned',async()=>{
 const t=await setup(),e=result();await send(t,{...e,studentId:'a1-001'});await send(t,{...e,learning:qLearning({helpUsed:true})});
 const log=(await request(t.env,'/api/admin/logs?eventType=question_result',{token:t.admin.token})).data.events;
 assert.equal(log.length,1);assert.equal(log[0].studentId,'a2-001');assert.equal(log[0].learning.helpUsed,false);assert.equal(log[0].details.attempt,1);
 assert.equal((await t.env.DB.prepare('SELECT COUNT(*) AS n FROM event_learning').first()).n,1);t.env.DB.close();
});

test('first, latest, independent and assisted attempts retain their different meanings',async()=>{
 const t=await setup();await send(t,event('question_open',qLearning({wallSeconds:null,activeSeconds:null,timingScope:'unavailable'})));await send(t,result());await send(t,result('incorrect',qLearning({hintUsed:true,helpUsed:true})));await send(t,result('correct',qLearning({helpUsed:true,answerRevealed:true})));
 const r=await report(t),q=r.questions[0];assert.equal(q.openedCount,1);assert.equal(q.attemptCount,3);assert.equal(q.firstAttempt.outcome,'incorrect');assert.equal(q.latestAttempt.outcome,'correct');assert.equal(q.latestAttempt.activeSeconds,18);assert.equal(q.latestAttempt.assisted,true);assert.equal(q.improved,true);assert.equal(q.independentCorrect,false);assert.equal(q.assistedCorrect,true);
 assert.equal(r.summary.firstAttemptCorrect,0);assert.equal(r.summary.firstAttemptGraded,1);assert.equal(r.summary.improvedCount,1);assert.equal(r.summary.assistedCorrect,1);assert.equal(r.repeatedErrors[0].wrongCount,2);assert.equal(r.repeatedErrors[0].questionCount,1);t.env.DB.close();
});

test('date filtering never promotes a later attempt to the actual first attempt',async()=>{
 const t=await setup(),first=result();await send(t,first);await t.env.DB.prepare('UPDATE events SET created_at=? WHERE event_id=?').bind('2001-01-01T00:00:00.000Z',first.eventId).run();await send(t,result('correct'));
 const r=await report(t,'?from=2020-01-01');assert.equal(r.questions[0].attemptCount,1);assert.equal(r.questions[0].firstAttempt.attempt,1);assert.equal(r.questions[0].firstAttempt.outcome,'incorrect');assert.equal(r.questions[0].latestAttempt.attempt,2);assert.equal(r.summary.improvedCount,1);t.env.DB.close();
});

test('legacy results and page visits keep assistance and timing unknown rather than inventing zero',async()=>{
 const t=await setup();await send(t,[result('correct',null),event('activity_view',null)]);const r=await report(t),q=r.questions[0];assert.equal(q.firstAttempt.assisted,null);assert.equal(q.firstAttempt.wallSeconds,null);assert.equal(q.firstAttempt.timingScope,'unavailable');assert.equal(r.summary.independentCorrect,0);assert.equal(r.summary.unknownAssistanceCorrect,1);assert.equal(r.pages[0].visitCount,null);assert.equal(r.pages[0].activeSeconds,null);assert.equal(r.pages[0].completed,null);assert.equal(r.progress[0].completed,null);assert.equal(r.progress[0].viewedPages,null);assert.equal(r.progress[0].answeredPages,null);t.env.DB.close();
});

test('page slices sum per visit and distinguish returning, viewing, completion and attendance credit',async()=>{
 const t=await setup(),visitId=crypto.randomUUID();await send(t,[event('page_summary',page({visitId})),event('page_summary',page({visitId,viewSeconds:15,activeSeconds:6})),event('page_summary',page({viewSeconds:10,activeSeconds:4})),event('lesson_progress',progress())]);
 const r=await report(t),p=r.pages[0];assert.equal(p.visitCount,2);assert.equal(p.viewSeconds,55);assert.equal(p.activeSeconds,22);assert.equal(p.completed,true);assert.equal(r.progress[0].currentPageCompleted,true);assert.equal(r.progress[0].completed,false);assert.equal(r.summary.activeSeconds,0,'analytics do not grant attendance');assert.equal((await t.env.DB.prepare('SELECT SUM(active_seconds) AS s FROM events').first()).s,0);t.env.DB.close();
});

test('lesson progress counts distinct teaching indices and excludes breaks, resources and unclassified old visits',async()=>{
 const t=await setup(),time=Date.now(),at=i=>new Date(time+i*1000).toISOString();
 const on=(type,learning,id,i)=>event(type,learning,{activity:id,context:context(id),occurredAt:at(i)});
 await send(t,[on('page_summary',page(),'6',0),on('lesson_progress',progress(),'6',1),on('page_summary',page(),'6-board',2),on('activity_view',null,'old-unknown',3),on('page_summary',page({pageKind:'resource',pageIndex:-1}),'resources',4),on('lesson_progress',progress({pageKind:'break',pageIndex:-1,questionCount:0,answeredQuestionCount:0}),'break-screen',5),{...result('correct'),occurredAt:at(6)}]);
 let p=(await report(t)).progress[0];assert.equal(p.viewedPages,1);assert.equal(p.completedPages,1);assert.equal(p.answeredPages,1);assert.equal(p.totalPages,2);assert.equal(p.completed,false);assert.equal(p.lastScreenId,'break-screen');assert.equal(p.currentPageCompleted,true);assert.equal(p.activeSeconds,24,'only two teaching-screen observations contribute');
 await send(t,on('lesson_progress',progress({pageIndex:1}),'7',7));p=(await report(t)).progress[0];assert.equal(p.viewedPages,2);assert.equal(p.completedPages,2);assert.equal(p.answeredPages,1);assert.equal(p.completed,true);assert.equal(p.lastScreenId,'7');t.env.DB.close();
});

test('break duration, selected summaries, pauses and early ending survive in the report and timeline',async()=>{
 const t=await setup(),b=breakLearning();await send(t,[event('break_start',b),event('break_pause',{...b,elapsedSeconds:100}),event('break_resume',{...b,elapsedSeconds:100,pausedSeconds:25}),event('break_end',{...b,elapsedSeconds:240,pausedSeconds:25,endReason:'early'})]);const r=await report(t),v=r.breaks[0];assert.equal(r.summary.breakCount,1);assert.equal(v.status,'ended');assert.equal(v.elapsedSeconds,240);assert.equal(v.pausedSeconds,25);assert.equal(v.pauses,1);assert.equal(v.selectedPages[0].title,'Present Simple');assert.equal(v.endReason,'early');assert.ok(r.timeline.some(e=>e.type==='break_end'&&e.learning.breakId===b.breakId));t.env.DB.close();
});

test('dictionary repetitions use Istanbul calendar days and help records preserve attempted-before-help',async()=>{
 const t=await setup(),word={kind:'dictionary',term:'Learn',mode:'selection',outcome:'found',source:'local'},older=new Date(Date.now()-86400000).toISOString();await send(t,[event('dictionary_lookup',word,{occurredAt:older}),event('dictionary_lookup',{...word,term:'learn',mode:'manual'}),event('help_used',{kind:'help',helpType:'hint',questionId:'q-1',attemptedBeforeHelp:false,topicId:'present-simple',topicTitle:'Present Simple'}),event('help_used',{kind:'help',helpType:'hint',questionId:'q-1',attemptedBeforeHelp:true,topicId:'present-simple',topicTitle:'Present Simple'})]);
 const r=await report(t);assert.equal(r.dictionary[0].term,'learn');assert.equal(r.dictionary[0].count,2);assert.equal(r.dictionary[0].repeatDays,2);assert.equal(r.help[0].beforeAttempt,1);assert.equal(r.help[0].afterAttempt,1);assert.equal(r.summary.helpCount,2);t.env.DB.close();
});

test('new learning reports, detail and CSV are admin-only and filters keep identities separated',async()=>{
 const t=await setup();await send(t,result());assert.equal((await request(t.env,'/api/admin/learning')).status,401);assert.equal((await request(t.env,'/api/admin/learning',{token:t.student.token})).status,403);assert.equal((await request(t.env,'/api/admin/learning?student=../private',{token:t.admin.token})).status,400);
 assert.equal((await report(t,'?group=A1')).questions.length,0);assert.equal((await report(t,'?q=DENİZ')).questions.length,1);assert.equal((await report(t,'?student=a1-001')).students.length,1);const detail=(await request(t.env,'/api/admin/students/a2-001',{token:t.admin.token})).data;assert.equal(detail.events.find(e=>e.details).learning.topicId,'present-simple');t.env.DB.close();
});

test('CSV exports all learning fields with safe formula handling',async()=>{
 const t=await setup();await send(t,result('correct',qLearning({topicTitle:'=FORMULA'})));const csv=(await request(t.env,'/api/admin/logs.csv',{token:t.admin.token})).data;assert.match(csv,/Öğrenme ayrıntıları/);assert.match(csv,/'=FORMULA/);assert.match(csv,/question/);assert.match(csv,/wallSeconds/);t.env.DB.close();
});

test('replayed historical learning events never populate live presence or credit active seconds',async()=>{
 const t=await setup(),older=new Date(Date.now()-3600000).toISOString();await send(t,[event('page_summary',page(),{occurredAt:older,activeSeconds:30}),event('question_open',qLearning(),{occurredAt:older})]);const live=(await request(t.env,'/api/admin/presence',{token:t.admin.token})).data;assert.equal(live.tabs.length,0);assert.equal(live.online.length,0);assert.equal((await report(t)).summary.activeSeconds,0);t.env.DB.close();
});

test('large selected-summary lists fit the dedicated bounded request envelope',async()=>{
 const t=await setup(),b=breakLearning({selectedPages:Array.from({length:500},(_,i)=>({id:String(i),title:'Mola özeti '.repeat(14)})),selectedCount:500});await send(t,event('break_start',b));assert.equal((await report(t)).breaks[0].selectedPages.length,500);const invalid=event('break_start',{...b,selectedPages:[...b.selectedPages,{id:'501',title:'Too many'}]});assert.equal((await request(t.env,'/api/events',{token:t.student.token,body:{events:[invalid]}})).status,400);t.env.DB.close();
});

test('timeline and event limits disclose partial reports',()=>{
 const events=Array.from({length:310},(_,i)=>({id:i+1,studentId:'a2-001',studentName:'Deniz',group:'A2',type:'idle_start',lesson,activity:'6',createdAt:new Date(Date.UTC(2026,0,1,0,0,i)).toISOString(),activeSeconds:0}));const r=aggregateLearning(events,[{id:'a2-001',name:'Deniz',group:'A2'}],[],{truncated:true,limit:310});assert.equal(r.timeline.length,300);assert.equal(r.truncated.timeline,true);assert.equal(r.truncated.events,true);assert.equal(r.timeline[0].id,310);
});
