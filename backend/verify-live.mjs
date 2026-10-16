import readline from 'node:readline';
import assert from 'node:assert/strict';
if(process.stdin.isTTY)process.stdin.setRawMode(true);
const reader=readline.createInterface({input:process.stdin,terminal:false});
console.log('Ready for private verification input.');
reader.once('line',async line=>{reader.close();if(process.stdin.isTTY)process.stdin.setRawMode(false);process.stdin.pause();let token='';
const base='https://english-student-access.gurkangr698.workers.dev',origin='https://feanoria-web.github.io';
async function call(path,{method='GET',body,auth=true}={}){const r=await fetch(base+path,{method,headers:{Origin:origin,'Content-Type':'application/json',...(token&&auth?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {r,data:r.headers.get('Content-Type')?.includes('json')?await r.json():await r.text()};}
try {
  const {password}=JSON.parse(line);const h=await call('/api/health');assert.equal(h.r.status,200);assert.equal(h.data.configured,true);
  const login=await call('/api/admin/login',{method:'POST',body:{password}});assert.equal(login.r.status,200,login.data.error);token=login.data.token;
  const me=await call('/api/auth/me');assert.equal(me.data.role,'admin');
  const report=await call('/api/admin/overview');assert.equal(report.r.status,200,report.data.error);assert.equal(report.data.students.length,68);assert.deepEqual(report.data.groups,['A1','A2','B1']);
  const counts=['A1','A2','B1'].map(g=>report.data.students.filter(s=>s.group===g).length);assert.deepEqual(counts,[29,19,20]);
  const csv=await call('/api/admin/export.csv');assert.equal(csv.r.status,200);assert.ok(csv.data.includes('Öğrenci'));
  const denied=await call('/api/admin/overview',{auth:false});assert.equal(denied.r.status,401);
  const events=await call('/api/events',{method:'POST',body:{events:[]},auth:false});assert.equal(events.r.status,401);
  console.log(JSON.stringify({ok:true,health:200,administrator:'verified',students:report.data.students.length,groups:counts,unauthorized:denied.r.status,csv:csv.r.status,studentActivityCreated:false}));
}catch(e){console.error('Canlı kontrol başarısız: '+e.message);process.exitCode=1;}finally{if(token)await call('/api/auth/logout',{method:'POST'}).catch(()=>{});}
});
