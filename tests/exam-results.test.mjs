import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openDatabase} from '../backend/local-db.mjs';
import {handleRequest,importStudents} from '../backend/service.mjs';
import {passwordHash} from '../backend/crypto.mjs';
import {scoreResult,validateExam} from '../backend/exam-results.mjs';
import {buildExamImport} from '../scripts/prepare-exam-import.mjs';

const migrations=new URL('../backend/migrations/',import.meta.url);
const schema=(await Promise.all((await fs.readdir(migrations)).filter(name=>name.endsWith('.sql')).sort().map(name=>fs.readFile(new URL(name,migrations),'utf8')))).join('\n');
const password='Teacher-tests-only!2026',hash=await passwordHash(password);
const origin='https://school.example',examId='2026-01-01-test';
const question=(n,answer)=>({n,topic:`Konu ${n}`,prompt:`Soru ${n}: I ___ here.`,options:['am','is','are','be'],answer,explanation:'Kural açıklaması.',why:[0,1,2,3].map(index=>index===answer?null:`Neden ${index} yanlış.`)});
const exam=(overrides={})=>({id:examId,title:"Deneme sınavı ' özel",date:'2026-01-01',description:'Açıklama',published:true,showLevel:false,
  sections:[{level:'A1',from:1,to:2,points:2.5,threshold:1},{level:'A2',from:3,to:3,points:5,threshold:1}],
  questions:[question(1,0),question(2,1),question(3,2)],writingSets:{A:{title:'Yazılı bölüm',prompts:['Where do you live?']}},...overrides});
const result=(paper,studentId,answers)=>({paper,studentId,nameOnPaper:`Kağıt ${paper}`,answers,notes:[`Not ${paper}`],checks:[`Öğretmen kontrolü ${paper}`],
  writing:{set:'A',parts:[{original:'I lives in Bursa.',corrected:'I live in Bursa.',fixes:[{from:'lives',to:'live',note:'I ile -s kullanılmaz.'}]}],strengths:'Güzel.',focus:['-s eki']}});
const bundle=(overrides={},students=[result(1,'a1-one','ab-'),result(2,'a1-two','*bc'),result(3,null,'aaa')])=>({exam:exam(overrides),results:{examId,students}});

async function setup(t,overrides={}) {
  const DB=openDatabase();t.after(()=>DB.close());DB.exec(schema);
  const env={DB,ADMIN_PASSWORD_HASH:hash,FRONTEND_ORIGIN:origin};
  await importStudents(env,[{id:'a1-one',name:'Birinci Öğrenci',group:'A1'},{id:'a1-two',name:'İkinci Öğrenci',group:'A1'},{id:'a1-three',name:'Üçüncü Öğrenci',group:'A1'}]);
  DB.exec(buildExamImport([bundle(overrides)]).sql);
  return env;
}
async function request(env,path,{token,body,method=body?'POST':'GET'}={}) {
  const response=await handleRequest(new Request('https://service.example'+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);
  assert.equal(response.headers.get('Cache-Control'),'no-store');
  return {status:response.status,data:await response.json()};
}
const login=async(env,name)=>(await request(env,'/api/auth/login',{body:{password:name}})).data.token;
const admin=async env=>(await request(env,'/api/admin/login',{body:{password}})).data.token;

test('score follows the answer key: section points, blanks, multiple marks and rounding',()=>{
  const a=scoreResult(exam(),'ab-');
  assert.deepEqual([a.total,a.max,a.correct,a.incorrect,a.blank,a.invalid,a.level],[5,10,2,0,1,0,'A1']);
  const b=scoreResult(exam(),'*bc');
  assert.deepEqual([b.total,b.correct,b.invalid,b.level],[8,2,1,'A2'],'7.5 rounds up to 8 like the paper key');
  assert.deepEqual(b.sections.map(s=>[s.level,s.correct,s.passed]),[['A1',1,true],['A2',1,true]]);
  assert.equal(scoreResult(exam(),'dd-').level,'Starter');
});

test('a student receives only their own published result, without teacher checks',async t=>{
  const env=await setup(t);
  assert.equal((await request(env,'/api/exam-results')).status,401);
  assert.equal((await request(env,'/api/exam-results',{token:'f'.repeat(64)})).status,401);
  const one=await request(env,'/api/exam-results',{token:await login(env,'Birinci Öğrenci')});
  assert.equal(one.status,200);
  assert.equal(one.data.exams.length,1);
  const [entry]=one.data.exams;
  assert.equal(entry.result.paper,1);
  assert.equal(entry.result.score.total,5);
  assert.equal(entry.result.score.level,undefined,'level is hidden unless the exam enables it');
  assert.equal(entry.writingSet.title,'Yazılı bölüm');
  assert.equal(entry.questions[0].why[0],null);
  const text=JSON.stringify(one.data);
  for(const secret of ['Öğretmen kontrolü','Kağıt 2','Kağıt 3','İkinci','writingSets','"published"'])assert.ok(!text.includes(secret),`student response must not include ${secret}`);
  const three=await request(env,'/api/exam-results',{token:await login(env,'Üçüncü Öğrenci')});
  assert.deepEqual(three.data,{exams:[]});
  assert.equal((await request(env,'/api/admin/exam-results',{token:await login(env,'Birinci Öğrenci')})).status,403);
});

test('unpublished exams stay hidden from students but administrators can preview every result',async t=>{
  const env=await setup(t,{published:false,showLevel:true});
  assert.deepEqual((await request(env,'/api/exam-results',{token:await login(env,'İkinci Öğrenci')})).data,{exams:[]});
  const token=await admin(env);
  assert.equal((await request(env,'/api/exam-results',{token})).status,403);
  const all=await request(env,'/api/admin/exam-results',{token});
  assert.equal(all.status,200);
  const [entry]=all.data.exams;
  assert.equal(entry.published,false);
  assert.deepEqual(entry.results.map(r=>[r.studentName,r.paper,r.score.total,r.checks[0]]),[['Birinci Öğrenci',1,5,'Öğretmen kontrolü 1'],['İkinci Öğrenci',2,8,'Öğretmen kontrolü 2']]);
  assert.equal(entry.results[1].score.level,'A2');
});

test('the importer validates every row and skips papers without a student account',()=>{
  const built=buildExamImport([bundle()],{studentIds:new Set(['a1-one','a1-two'])});
  assert.equal(built.resultCount,2);
  assert.deepEqual(built.skipped,[`${examId} · kağıt 3 (Kağıt 3)`]);
  assert.match(built.sql,/'Deneme sınavı '' özel'/);
  assert.ok(!/BEGIN|COMMIT/.test(built.sql));
  assert.throws(()=>buildExamImport([bundle()],{studentIds:new Set(['a1-one'])}),/öğrenci listesinde yok/);
  assert.throws(()=>buildExamImport([bundle({},[result(1,'a1-one','ab')])]),/Geçersiz sınav sonucu/);
  assert.throws(()=>buildExamImport([bundle({},[result(1,'a1-one','abc'),result(1,'a1-two','abc')])]),/iki kez/);
  assert.throws(()=>buildExamImport([bundle({},[{...result(1,'a1-one','abc'),extra:true}])]),/Geçersiz sınav sonucu/);
  assert.throws(()=>validateExam(exam({questions:[question(1,0),question(2,1)]})),/Geçersiz sınav tanımı/);
  assert.throws(()=>validateExam({...exam(),questions:[{...question(1,0),why:['x',null,'y','z']},question(2,1),question(3,2)]}),/Geçersiz sınav tanımı/);
});
