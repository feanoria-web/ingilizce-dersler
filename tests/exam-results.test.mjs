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
  assert.deepEqual(three.data,{exams:[],available:[]},'offline-only exams are not offered for online taking');
  assert.equal((await request(env,'/api/admin/exam-results',{token:await login(env,'Birinci Öğrenci')})).status,403);
});

test('unpublished exams stay hidden from students but administrators can preview every result',async t=>{
  const env=await setup(t,{published:false,showLevel:true});
  assert.deepEqual((await request(env,'/api/exam-results',{token:await login(env,'İkinci Öğrenci')})).data,{exams:[],available:[]});
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

test('a student without a result takes the exam online once; the key stays private until submission',async t=>{
  const env=await setup(t,{online:true,writingSets:{A:{title:'Yazılı bölüm',prompts:['Where do you live?']},B:{title:'Writing B1',prompts:['Your routine','A day you remember']}}});
  await importStudents(env,[{id:'b1-four',name:'Dördüncü Öğrenci',group:'B1'}]);
  const token=await login(env,'Üçüncü Öğrenci');
  const listed=await request(env,'/api/exam-results',{token});
  assert.deepEqual(listed.data.available,[{id:examId,title:"Deneme sınavı ' özel",date:'2026-01-01',description:'Açıklama',questionCount:3}]);
  const paper=await request(env,`/api/exams/${examId}/paper`,{token});
  assert.equal(paper.status,200);
  assert.deepEqual(paper.data.questions[0],{n:1,prompt:'Soru 1: I ___ here.',options:['am','is','are','be']});
  assert.equal(paper.data.writingSet.key,'A');
  for(const secret of ['"answer"','explanation','"why"','Kural açıklaması','topic'])assert.ok(!JSON.stringify(paper.data).includes(secret),`paper must not reveal ${secret}`);
  const b1Paper=await request(env,`/api/exams/${examId}/paper`,{token:await login(env,'Dördüncü Öğrenci')});
  assert.equal(b1Paper.data.writingSet.key,'B','B1 students write the B1 tasks');

  assert.equal((await request(env,`/api/exams/${examId}/submit`,{token,body:{answers:'ab',writing:['x']}})).status,400);
  assert.equal((await request(env,`/api/exams/${examId}/submit`,{token,body:{answers:'abz',writing:['x']}})).status,400);
  assert.equal((await request(env,`/api/exams/${examId}/submit`,{token,body:{answers:'abc',writing:['x','y']}})).status,400);
  const submitted=await request(env,`/api/exams/${examId}/submit`,{token,body:{answers:'a-c',writing:['  I live in Bursa.  ']}});
  assert.equal(submitted.status,200);
  assert.equal(submitted.data.result.score.total,8,'2.5 + 5 = 7.5 rounds up to 8');
  assert.deepEqual([submitted.data.result.score.correct,submitted.data.result.score.blank],[2,1]);
  assert.equal(submitted.data.result.source,'online');
  assert.equal(submitted.data.result.paper,null);
  assert.equal(submitted.data.result.nameOnPaper,'Üçüncü Öğrenci');
  assert.deepEqual(submitted.data.result.writing,{set:'A',pending:true,parts:[{original:'I live in Bursa.',corrected:'',fixes:[]}],strengths:'',focus:[]});
  assert.equal(submitted.data.questions[0].explanation,'Kural açıklaması.','explanations arrive with the result');
  assert.ok(submitted.data.result.notes.some(note=>/1 soruyu boş/.test(note)));

  assert.equal((await request(env,`/api/exams/${examId}/submit`,{token,body:{answers:'abc',writing:['again']}})).status,409);
  assert.equal((await request(env,`/api/exams/${examId}/paper`,{token})).status,409);
  const after=await request(env,'/api/exam-results',{token});
  assert.deepEqual(after.data.available,[]);
  assert.equal(after.data.exams[0].result.answers,'a-c');
  assert.equal((await request(env,`/api/exams/${examId}/paper`,{token:await login(env,'Birinci Öğrenci')})).status,409,'paper results also count as taken');

  // Re-importing the private paper results keeps the online submission.
  env.DB.exec(buildExamImport([bundle({online:true,writingSets:{A:{title:'Yazılı bölüm',prompts:['Where do you live?']},B:{title:'Writing B1',prompts:['Your routine','A day you remember']}}})]).sql);
  const kept=await request(env,'/api/exam-results',{token});
  assert.equal(kept.data.exams[0].result.source,'online');
  const all=await request(env,'/api/admin/exam-results',{token:await admin(env)});
  assert.ok(all.data.exams[0].results.some(r=>r.studentName==='Üçüncü Öğrenci'&&r.source==='online'));
});

test('offline, unpublished and unknown exams cannot be taken online',async t=>{
  for(const overrides of [{},{online:true,published:false}]) {
    const env=await setup(t,overrides);
    const token=await login(env,'Üçüncü Öğrenci');
    assert.equal((await request(env,`/api/exams/${examId}/paper`,{token})).status,404);
    assert.equal((await request(env,`/api/exams/${examId}/submit`,{token,body:{answers:'abc',writing:['x']}})).status,404);
  }
  const env=await setup(t,{online:true});
  const token=await login(env,'Üçüncü Öğrenci');
  assert.equal((await request(env,'/api/exams/../paper',{token})).status,404);
  assert.equal((await request(env,'/api/exams/unknown-exam/paper',{token})).status,404);
  assert.equal((await request(env,`/api/exams/${examId}/paper`)).status,401);
  assert.equal((await request(env,`/api/exams/${examId}/paper`,{token:await admin(env)})).status,403);
});
