import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openDatabase} from '../backend/local-db.mjs';
import {handleRequest,importStudents} from '../backend/service.mjs';
import {passwordHash,digest} from '../backend/crypto.mjs';
import {MAX_GUIDE_BYTES,MAX_IMPORT_STATEMENT_BYTES} from '../backend/teacher-guides.mjs';
import {buildTeacherGuideImport} from '../scripts/prepare-teacher-guides-import.mjs';

const migrations=new URL('../backend/migrations/',import.meta.url);
const schema=(await Promise.all((await fs.readdir(migrations)).filter(name=>name.endsWith('.sql')).sort().map(name=>fs.readFile(new URL(name,migrations),'utf8')))).join('\n');
const password='Teacher-tests-only!2026',hash=await passwordHash(password);
const origin='https://school.example',base='/api/admin/teacher-guides';
const fixture=()=>({id:'a1/day-01',title:"A1 · Öğretmenin rehberi ' özel",sections:[
  {id:'notes',title:'Öğretmen notları',content:{html:"<h2>Çalışma & öğretmen</h2><p>'Deneyin' 🙂</p>",questions:[{answer:'Evet',feedback:['Birinci','İkinci']}],script:"</script><script>window.secret='fixture';</script>",nullValue:null}},
  {id:'raw',title:'Kaynak',content:['Türkçe','\u0000',false,42]}
],attachments:[{name:'çalışma.html',mime:'text/html',base64:Buffer.from('<p>Özel ek</p>').toString('base64')}]});
async function setup(t,guide=fixture()) {
  const DB=openDatabase();t.after(()=>DB.close());DB.exec(schema);
  const env={DB,ADMIN_PASSWORD_HASH:hash,FRONTEND_ORIGIN:origin};
  await importStudents(env,[{id:'a1-test',name:'Örnek Öğrenci',group:'A1'}]);
  DB.exec((await buildTeacherGuideImport({version:1,lessons:[guide]})).sql);
  return env;
}
async function request(env,path=base,{token,body,method=body?'POST':'GET',requestOrigin=origin}={}) {
  const response=await handleRequest(new Request('https://service.example'+path,{method,headers:{Origin:requestOrigin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'),'nosniff');
  return {status:response.status,data:await response.json(),headers:response.headers};
}
const admin=async env=>(await request(env,'/api/admin/login',{body:{password}})).data.token;
const student=async env=>(await request(env,'/api/auth/login',{body:{password:'Örnek Öğrenci'}})).data.token;

test('private guide list and payload require an existing administrator session before reading chunks',async t=>{
  const env=await setup(t),studentToken=await student(env),queries=[];
  const prepare=env.DB.prepare;
  env.DB.prepare=sql=>{queries.push(sql);return prepare(sql);};
  for(const path of [base,base+'/a1/day-01',base+'/a1/unknown']) {
    assert.equal((await request(env,path)).status,401);
    assert.equal((await request(env,path,{token:'f'.repeat(64)})).status,401);
    assert.equal((await request(env,path,{token:studentToken})).status,403);
  }
  assert.ok(!queries.some(sql=>/teacher_guide/.test(sql)),'unauthorized access must not query the private guide tables');
  await env.DB.prepare('UPDATE students SET enabled=0 WHERE id=?').bind('a1-test').run();
  assert.equal((await request(env,base+'/a1/day-01',{token:studentToken})).status,401);
});

test('administrator receives exactly the preserved Unicode, arbitrary JSON and attached source',async t=>{
  const guide=fixture(),env=await setup(t,guide),token=await admin(env);
  const list=await request(env,base,{token});
  assert.equal(list.status,200);assert.deepEqual(list.data,{lessons:[{id:guide.id,title:guide.title}]});
  assert.ok(!JSON.stringify(list.data).includes('fixture'));
  const full=await request(env,base+'/'+guide.id,{token});
  assert.equal(full.status,200);assert.deepEqual(full.data,guide);
  assert.equal(full.headers.get('Vary'),'Origin');
  assert.equal(full.headers.get('Access-Control-Allow-Origin'),origin);
  assert.equal((await request(env,base+'/'+guide.id,{token,method:'POST',body:{}})).status,404);
  assert.equal((await request(env,'/api/teacher-guides/'+guide.id,{token})).status,404);
});

test('expired and logged-out admin sessions cannot retrieve the guide or its index',async t=>{
  const env=await setup(t),expired=await admin(env),loggedOut=await admin(env);
  await env.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind('2000-01-01T00:00:00.000Z',await digest(expired)).run();
  for(const path of [base,base+'/a1/day-01'])assert.equal((await request(env,path,{token:expired})).status,401);
  assert.equal((await request(env,'/api/auth/logout',{token:loggedOut,method:'POST'})).status,200);
  assert.equal((await request(env,base+'/a1/day-01',{token:loggedOut})).status,401);
});

test('existing admin password change revokes the other guide reader session',async t=>{
  const env=await setup(t),current=await admin(env),other=await admin(env);
  assert.equal((await request(env,'/api/admin/password',{token:current,body:{currentPassword:password,newPassword:'Changed-teacher-password!2026'}})).status,200);
  assert.equal((await request(env,base+'/a1/day-01',{token:other})).status,401);
  assert.equal((await request(env,base+'/a1/day-01',{token:current})).status,200);
  assert.equal((await request(env,'/api/admin/login',{body:{password}})).status,401);
});

test('cross-origin calls fail before authentication and do not expose permissive CORS',async t=>{
  const env=await setup(t),token=await admin(env);
  for(const path of [base,base+'/a1/day-01']) {
    const result=await request(env,path,{token,requestOrigin:'https://other.example'});
    assert.equal(result.status,403);assert.equal(result.headers.get('Access-Control-Allow-Origin'),null);
    assert.ok(!JSON.stringify(result.data).includes('Öğretmenin'));
  }
});

test('traversal, encoded segments, unknown IDs and oversized route IDs return no content',async t=>{
  const env=await setup(t),token=await admin(env);
  for(const id of ['a1/unknown','a3/day-01','a1/day-01/extra','a1/%64ay-01','a1/%2e%2e%2fday-01','a1/day-01%00','a1/'+ 'x'.repeat(500),'a1/../../auth/me']) {
    const result=await request(env,base+'/'+id,{token});
    assert.equal(result.status,404,id);assert.ok(!JSON.stringify(result.data).includes('fixture'));
  }
});

test('missing database table, incomplete import and checksum corruption all fail closed',async t=>{
  const env=await setup(t),token=await admin(env);
  await env.DB.prepare("UPDATE teacher_guides SET payload_bytes=0,chunk_count=0 WHERE lesson_id='a1/day-01'").run();
  assert.equal((await request(env,base+'/a1/day-01',{token})).status,503);
  assert.deepEqual((await request(env,base,{token})).data,{lessons:[]});
  env.DB.exec((await buildTeacherGuideImport({version:1,lessons:[fixture()]})).sql);
  await env.DB.prepare("UPDATE teacher_guides SET payload_sha256=? WHERE lesson_id='a1/day-01'").bind('a'.repeat(64)).run();
  const corrupted=await request(env,base+'/a1/day-01',{token});assert.equal(corrupted.status,503);assert.ok(!JSON.stringify(corrupted.data).includes('fixture'));
  env.DB.exec('DROP TABLE teacher_guide_chunks;DROP TABLE teacher_guides;');
  assert.equal((await request(env,base+'/a1/day-01',{token})).status,500);
  assert.equal((await request(env,base,{token})).status,500);
});

test('import round trip escapes SQL and bounds every complete escaped UTF-8 statement',async t=>{
  const guide=fixture();guide.sections[0].content={html:"'); DROP TABLE students;--🙂İğ'".repeat(6000)};
  guide.attachments.push({name:'large.txt',mime:'text/plain',base64:Buffer.alloc(1024*1024,120).toString('base64')});
  const imported=await buildTeacherGuideImport({version:1,lessons:[guide]});
  assert.ok(imported.chunkCount>4);
  for(const line of imported.sql.trim().split('\n'))assert.ok(Buffer.byteLength(line,'utf8')<=MAX_IMPORT_STATEMENT_BYTES);
  assert.ok(!/^\s*(BEGIN|COMMIT|DROP)\b/im.test(imported.sql));
  const env=await setup(t);env.DB.exec(imported.sql);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM students').first()).n,1);
  const response=await request(env,base+'/'+guide.id,{token:await admin(env)});
  assert.equal(response.status,200);assert.deepEqual(response.data,guide);
  env.DB.exec(imported.sql);
  assert.equal((await env.DB.prepare('SELECT COUNT(*) AS n FROM teacher_guide_chunks').first()).n,imported.chunkCount,'reimport replaces rather than appends chunks');
});

test('importer rejects duplicate, unsafe, malformed and oversized guides before producing SQL',async()=>{
  const guide=fixture(),bundle=lesson=>({version:1,lessons:[lesson]});
  await assert.rejects(buildTeacherGuideImport({version:1,lessons:[guide,guide]}),/Yinelenmiş/);
  for(const id of ['a1/../day-01','A1/day-01','a1/day-01?x=1','a1/day%2d01','a1/'+ 'x'.repeat(101)])await assert.rejects(buildTeacherGuideImport(bundle({...guide,id})));
  await assert.rejects(buildTeacherGuideImport(bundle({...guide,sections:[guide.sections[0],guide.sections[0]]})));
  await assert.rejects(buildTeacherGuideImport(bundle({...guide,attachments:[{name:'a',mime:'text/html',base64:'broken!'}]})));
  await assert.rejects(buildTeacherGuideImport(bundle({...guide,sections:[{id:'oversize',title:'Large',content:'x'.repeat(MAX_GUIDE_BYTES)}]})),/boyut/);
});
