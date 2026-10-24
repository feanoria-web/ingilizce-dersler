import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openDatabase} from '../backend/local-db.mjs';
import {handleRequest} from '../backend/service.mjs';
import {digest} from '../backend/crypto.mjs';

const migrations=new URL('../backend/migrations/',import.meta.url);
const schema=(await Promise.all((await fs.readdir(migrations)).filter(name=>name.endsWith('.sql')).sort().map(name=>fs.readFile(new URL(name,migrations),'utf8')))).join('\n');
const origin='https://school.example';
const tokens={one:'1'.repeat(64),two:'2'.repeat(64),disabled:'3'.repeat(64),expired:'4'.repeat(64),admin:'a'.repeat(64)};
const path='/api/exam-results/view',reportPath='/api/admin/exam-result-views';
const viewId='A2F6BA98-87C5-4EA2-B9A0-DEC32938AA01';

async function setup(t) {
  const DB=openDatabase();t.after(()=>DB.close());DB.exec(schema);
  const now=new Date().toISOString(),future=new Date(Date.now()+3600000).toISOString();
  await DB.batch([
    ...[['a1-one','Birinci Öğrenci','A1',1],['b1-two','İkinci Öğrenci','B1',1],['a1-unseen','Üçüncü Öğrenci','A1',1],['a2-disabled','Kapalı Öğrenci','A2',0]].map(args=>DB.prepare('INSERT INTO students(id,name,group_name,enabled,created_at) VALUES(?,?,?,?,?)').bind(...args,now)),
    ...await Promise.all(Object.entries(tokens).map(async([key,token])=>DB.prepare('INSERT INTO sessions(token_hash,role,student_id,created_at,expires_at,last_seen) VALUES(?,?,?,?,?,?)').bind(await digest(token),key==='admin'?'admin':'student',key==='admin'?null:key==='two'?'b1-two':key==='disabled'?'a2-disabled':'a1-one',now,key==='expired'?'2000-01-01T00:00:00.000Z':future,now))),
  ]);
  return {DB,FRONTEND_ORIGIN:origin};
}
async function request(env,url,{token,body,method=body===undefined?'GET':'POST',requestOrigin=origin,contentType='application/json'}={}) {
  const response=await handleRequest(new Request('https://service.example'+url,{method,headers:{Origin:requestOrigin,'Content-Type':contentType,...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)})}),env);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('Vary'),'Origin');
  const data=response.headers.get('Content-Type')?.includes('json')?await response.json():await response.text();
  return {status:response.status,data,headers:response.headers};
}
const view=(env,token=tokens.one,id=viewId,extras={})=>request(env,path,{token,body:{viewId:id,...extras}});
const counts=async env=>Promise.all(['exam_result_views',"events WHERE type='exam_results_view'"].map(table=>env.DB.prepare('SELECT COUNT(*) AS n FROM '+table).first().then(row=>row.n)));

test('view recording is student-only and reports are administrator-only, including expired/disabled sessions',async t=>{
  const env=await setup(t);
  for(const token of [undefined,'f'.repeat(64),tokens.expired,tokens.disabled]) {
    assert.equal((await request(env,path,{token,body:{viewId}})).status,401);
    assert.equal((await request(env,reportPath,{token})).status,401);
  }
  assert.equal((await view(env,tokens.admin)).status,403,'admin preview must not count as a student view');
  for(const token of [tokens.one,tokens.two])assert.equal((await request(env,reportPath,{token})).status,403);
  assert.deepEqual(await counts(env),[0,0]);
});

test('result fetches never count as views and malformed visit IDs cannot create records',async t=>{
  const env=await setup(t);
  for(let i=0;i<2;i++)assert.deepEqual((await request(env,'/api/exam-results',{token:tokens.one})).data,{exams:[],available:[]});
  assert.deepEqual(await counts(env),[0,0]);
  for(const invalid of [undefined,null,42,{},[],viewId+'x','not-a-uuid','00000000-0000-0000-0000-00000000000g','<script>'])assert.equal((await request(env,path,{token:tokens.one,body:{viewId:invalid}})).status,400,String(invalid));
  assert.equal((await request(env,path,{token:tokens.one,body:[]})).status,400);
  assert.equal((await request(env,path,{token:tokens.one,body:{viewId},contentType:'text/plain'})).status,415);
  assert.equal((await view(env,tokens.one,viewId,{extra:'x'.repeat(1000)})).status,413);
  assert.deepEqual(await counts(env),[0,0]);
});

test('server identity and time are authoritative; no extra submitted details enter the visit or ordinary log',async t=>{
  const env=await setup(t),before=new Date().toISOString();
  assert.deepEqual((await view(env,tokens.one,viewId,{studentId:'b1-two',createdAt:'2000-01-01T00:00:00.000Z',occurredAt:'2099-01-01T00:00:00.000Z',examId:'other-exam',answers:'PRIVATE ANSWERS'})).data,{ok:true});
  const after=new Date().toISOString(),row=await env.DB.prepare('SELECT * FROM exam_result_views').first();
  assert.equal(row.student_id,'a1-one');assert.equal(row.view_id,viewId.toLowerCase());
  assert.ok(row.created_at>=before&&row.created_at<=after);
  const event=await env.DB.prepare("SELECT * FROM events WHERE type='exam_results_view'").first();
  assert.equal(event.student_id,'a1-one');assert.equal(event.lesson,'panel');assert.equal(event.activity,'exam-results');
  assert.equal(event.created_at,row.created_at);assert.equal(event.occurred_at,null);assert.equal(event.active_seconds,0);
  assert.ok(!JSON.stringify([row,event]).includes('PRIVATE ANSWERS'));
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM event_contexts').first()).n,0);
  const response=await request(env,reportPath,{token:tokens.admin});
  assert.equal(response.status,200);assert.equal(response.data.students.find(s=>s.id==='b1-two').hasViewed,false);
});

test('retries preserve the first receipt time and create one ordinary log while different visits/students count independently',async t=>{
  const env=await setup(t),originalTime='2026-01-01T10:00:00.000Z';
  assert.equal((await view(env)).status,200);
  await env.DB.batch([
    env.DB.prepare('UPDATE exam_result_views SET created_at=?').bind(originalTime),
    env.DB.prepare("UPDATE events SET created_at=? WHERE type='exam_results_view'").bind(originalTime),
  ]);
  for(const id of [viewId,viewId.toLowerCase()])assert.equal((await view(env,tokens.one,id)).status,200);
  assert.deepEqual(await counts(env),[1,1]);
  assert.equal((await env.DB.prepare('SELECT created_at FROM exam_result_views').first()).created_at,originalTime);
  assert.equal((await env.DB.prepare("SELECT created_at FROM events WHERE type='exam_results_view'").first()).created_at,originalTime);
  assert.equal((await view(env,tokens.two,viewId)).status,200,'same client UUID from another student remains a separate visit');
  assert.equal((await view(env,tokens.one,crypto.randomUUID())).status,200);
  assert.deepEqual(await counts(env),[3,3]);
  const report=(await request(env,reportPath,{token:tokens.admin})).data;
  const one=report.students.find(s=>s.id==='a1-one');
  assert.equal(one.viewCount,2);assert.equal(one.firstViewedAt,originalTime);assert.ok(one.lastViewedAt>originalTime);
  assert.equal(report.students.find(s=>s.id==='b1-two').viewCount,1);
});

test('the report includes every active student, even accounts that never logged in, and immediately reflects later visits',async t=>{
  const env=await setup(t);
  const unseen=(await request(env,reportPath,{token:tokens.admin})).data;
  assert.deepEqual(unseen.stats,{total:3,viewed:0,notViewed:3});
  assert.equal(unseen.students.length,3);
  for(const student of unseen.students)assert.deepEqual([student.hasViewed,student.viewCount,student.firstViewedAt,student.lastViewedAt],[false,0,null,null]);
  assert.ok(unseen.students.some(student=>student.id==='a1-unseen'));
  assert.ok(!unseen.students.some(student=>student.id==='a2-disabled'));
  await view(env);
  await env.DB.prepare('INSERT INTO exam_result_views(student_id,view_id,created_at) VALUES(?,?,?)').bind('a2-disabled',crypto.randomUUID(),new Date().toISOString()).run();
  const report=(await request(env,reportPath+'?student=b1-two',{token:tokens.admin})).data;
  assert.deepEqual(report.stats,{total:3,viewed:1,notViewed:2});
  assert.equal(report.students.length,3,'report remains a complete active roster, without implicit date/login filtering');
  assert.deepEqual(Object.keys(report.students[0]).sort(),['firstViewedAt','group','hasViewed','id','lastViewedAt','name','viewCount']);
  assert.ok(!JSON.stringify(report).includes('view_id'));
  assert.ok(!JSON.stringify(report).includes(tokens.admin));
});

test('the ordinary administrator log and CSV support the new type, but generic client events cannot forge it',async t=>{
  const env=await setup(t);
  const forged={eventId:crypto.randomUUID(),type:'exam_results_view',lesson:'panel',activity:'exam-results'};
  assert.equal((await request(env,'/api/events',{token:tokens.one,body:{events:[forged]}})).status,400);
  assert.deepEqual(await counts(env),[0,0]);
  await view(env);await view(env);
  const log=(await request(env,'/api/admin/logs?eventType=exam_results_view',{token:tokens.admin})).data;
  assert.equal(log.events.length,1);assert.equal(log.events[0].studentId,'a1-one');
  assert.equal(log.events[0].type,'exam_results_view');assert.equal(log.events[0].details,null);
  const csv=await request(env,'/api/admin/logs.csv?eventType=exam_results_view',{token:tokens.admin});
  assert.equal(csv.status,200);assert.match(csv.data,/exam_results_view/);
  const event=await env.DB.prepare("SELECT event_id FROM events WHERE type='exam_results_view'").first();
  assert.equal((await request(env,'/api/events',{token:tokens.one,body:{events:[{...forged,type:'page_view',eventId:event.event_id}]}})).status,400,'generic events cannot collide with reserved event IDs');
  assert.deepEqual(await counts(env),[1,1]);
});

test('cross-origin recording/reporting is denied without writes or credentialed CORS access',async t=>{
  const env=await setup(t);
  for(const [url,options] of [[path,{body:{viewId},token:tokens.one}],[reportPath,{token:tokens.admin}]]) {
    const response=await request(env,url,{...options,requestOrigin:'https://evil.example'});
    assert.equal(response.status,403);assert.equal(response.headers.get('Access-Control-Allow-Origin'),null);
  }
  assert.deepEqual(await counts(env),[0,0]);
});

test('a failed ordinary log insert rolls back the visit so retry can record both atomically',async t=>{
  const env=await setup(t);
  env.DB.exec("CREATE TRIGGER reject_exam_view BEFORE INSERT ON events WHEN NEW.type='exam_results_view' BEGIN SELECT RAISE(ABORT,'test failure'); END;");
  assert.equal((await view(env)).status,500);assert.deepEqual(await counts(env),[0,0]);
  env.DB.exec('DROP TRIGGER reject_exam_view');
  assert.equal((await view(env)).status,200);assert.deepEqual(await counts(env),[1,1]);
});
