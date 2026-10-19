import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {openDatabase} from '../backend/local-db.mjs';
import {handleRequest,importStudents} from '../backend/service.mjs';
import {normalizeName,passwordHash,digest} from '../backend/crypto.mjs';
import {validateContext} from '../backend/detailed-logs.mjs';
const migrations=new URL('../backend/migrations/',import.meta.url);
const schema=(await Promise.all((await fs.readdir(migrations)).filter(n=>n.endsWith('.sql')).sort().map(n=>fs.readFile(new URL(n,migrations),'utf8')))).join('\n');
const adminPassword='Test-only!Strong-password-2026';
const hash=await passwordHash(adminPassword);
async function setup(){const DB=openDatabase();DB.exec(schema);const env={DB,ADMIN_PASSWORD_HASH:hash,FRONTEND_ORIGIN:'https://school.example'};await importStudents(env,[{id:'a2-001',name:'Deniz Örnek',group:'A2',aliases:['denizornk','deniz ornk']},{id:'a1-001',name:'Ece Deneme',group:'A1'},{id:'a1-002',name:'Ece Örnek',group:'A1'},{id:'b1-001',name:'Test Kullanıcı',group:'B1'}]);return env;}
async function request(env,path,{body,token,origin='https://school.example',method=body?'POST':'GET'}={}){const r=await handleRequest(new Request('https://service.example'+path,{method,headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})}),env);return {status:r.status,data:r.headers.get('Content-Type')?.includes('json')?await r.json():await r.text(),headers:r.headers};}
const studentLogin=(env,password='deniz')=>request(env,'/api/auth/login',{body:{password}});
const adminLogin=env=>request(env,'/api/admin/login',{body:{password:adminPassword}});
test('Turkish/spaces/case/an explicit alternate spelling identify the same account',async()=>{const e=await setup();for(const name of ['deniz','Deniz Örnek','DENİZ ÖRNEK','denizornek','denizornk','deniz ornk',' deniz  örnek ']){const r=await studentLogin(e,name);assert.equal(r.status,200);assert.equal(r.data.student.id,'a2-001');}assert.equal(normalizeName('GÜRKAN ÖZTÜRK'),'gurkanozturk');e.DB.close();});
test('ambiguous first names never silently pick one student',async()=>{const e=await setup();const r=await studentLogin(e,'ece');assert.equal(r.status,401);assert.match(r.data.error,/tamamını/);assert.equal((await studentLogin(e,'ecedeneme')).status,200);e.DB.close();});
test('student token cannot read any admin data and token hashes are stored',async()=>{const e=await setup();const s=(await studentLogin(e)).data;assert.equal((await request(e,'/api/admin/overview',{token:s.token})).status,403);assert.equal((await request(e,'/api/admin/overview')).status,401);const db=await e.DB.prepare('SELECT * FROM sessions').first();assert.notEqual(db.token_hash,s.token);assert.equal(db.token_hash,await digest(s.token));e.DB.close();});
test('events are assigned server-side, deduplicated, and raw answers discarded',async()=>{const e=await setup(),s=(await studentLogin(e)).data;const event={eventId:crypto.randomUUID(),type:'answer_check',lesson:'lessons/a2/day-01.html',activity:'6',studentId:'b1-001',answer:'DO NOT STORE'};for(let i=0;i<2;i++)assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[event]}})).status,200);const items=(await e.DB.prepare("SELECT * FROM events WHERE type='answer_check'").all()).results;assert.equal(items.length,1);assert.equal(items[0].student_id,'a2-001');assert.ok(!JSON.stringify(items).includes('DO NOT STORE'));assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[{...event,eventId:crypto.randomUUID(),type:'login'}]}})).status,400);e.DB.close();});
test('heartbeat credit uses elapsed shared clock and replay does not add time',async()=>{const e=await setup(),s=(await studentLogin(e)).data;await e.DB.prepare('UPDATE students SET last_credited_at=? WHERE id=?').bind(new Date(Date.now()-30000).toISOString(),'a2-001').run();const event={eventId:crypto.randomUUID(),type:'heartbeat',lesson:'panel',activity:'',activeSeconds:999};await request(e,'/api/events',{token:s.token,body:{events:[event]}});await request(e,'/api/events',{token:s.token,body:{events:[event,{...event,eventId:crypto.randomUUID()}]}});const row=await e.DB.prepare("SELECT SUM(active_seconds) AS seconds FROM events WHERE type='heartbeat'").first();assert.ok(row.seconds>=29&&row.seconds<=30);e.DB.close();});
test('disabling a student revokes existing sessions and prevents future name login',async()=>{const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data;assert.equal((await request(e,'/api/admin/students/a2-001',{token:a.token,body:{enabled:false}})).status,200);assert.equal((await request(e,'/api/auth/me',{token:s.token})).status,401);assert.equal((await studentLogin(e)).status,401);await importStudents(e,[{id:'a2-001',name:'Deniz Örnek',group:'A2',enabled:true}]);assert.equal((await studentLogin(e)).status,401,'reimport must not re-enable deliberately disabled students');e.DB.close();});
test('overview distinguishes lifetime never-entered from a quiet selected date',async()=>{const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data;const data=(await request(e,'/api/admin/overview?from=2001-01-01&to=2001-01-02',{token:a.token})).data;assert.equal(data.stats.total,4);assert.equal(data.stats.visited,0);assert.equal(data.stats.never,3);assert.equal(data.students.find(x=>x.id===s.student.id).everVisited,true);assert.equal((await request(e,'/api/admin/overview?from=2026-02-31',{token:a.token})).status,400);e.DB.close();});
test('admin password change invalidates other admin sessions; logout/expiry revokes access',async()=>{const e=await setup(),a=(await adminLogin(e)).data,b=(await adminLogin(e)).data;assert.equal((await request(e,'/api/admin/password',{token:a.token,body:{currentPassword:adminPassword,newPassword:'New-test-password-2026!'}})).status,200);assert.equal((await request(e,'/api/admin/overview',{token:b.token})).status,401);assert.equal((await adminLogin(e)).status,401);await request(e,'/api/auth/logout',{token:a.token,method:'POST'});assert.equal((await request(e,'/api/auth/me',{token:a.token})).status,401);e.DB.close();});
test('CORS is restricted, CSV is admin-only, rate limiting rejects repeated guessing',async()=>{const e=await setup();assert.equal((await request(e,'/api/health',{origin:'https://evil.example'})).status,403);assert.equal((await request(e,'/api/admin/export.csv')).status,401);for(let i=0;i<6;i++)assert.equal((await request(e,'/api/admin/login',{body:{password:'wrong-password'}})).status,401);assert.equal((await request(e,'/api/admin/login',{body:{password:'wrong-password'}})).status,429);e.DB.close();});
test('CSV formula injection escaped and no name list is exposed by login errors',async()=>{const e=await setup();await e.DB.prepare('UPDATE students SET name=? WHERE id=?').bind('=FORMULA','b1-001').run();const a=(await adminLogin(e)).data;const r=await request(e,'/api/admin/export.csv',{token:a.token});assert.match(r.data,/'=FORMULA/);const invalid=await studentLogin(e,'unknown student');assert.ok(!JSON.stringify(invalid.data).includes('Ece'));e.DB.close();});
const question=(outcome='incorrect',answer='wrong')=>({eventId:crypto.randomUUID(),type:'question_result',lesson:'lessons/a2/day-01.html',activity:'6',details:{questionId:'check-0',prompt:'Choose a reply.',selectedAnswer:answer,correctAnswer:'Hello',outcome,assessmentKind:'multiple-choice'}});
test('detailed results preserve wrong/correct/blank attempts exactly once with server identity',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data,wrong=question();
 for(const event of [wrong,wrong,question('correct','Hello'),question('blank','')])assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[{...event,studentId:'b1-001',password:'DO NOT STORE'}]}})).status,200);
 const log=(await request(e,'/api/admin/logs?eventType=question_result',{token:a.token})).data;
 assert.equal(log.events.length,3);assert.deepEqual(log.events.map(x=>x.details.attempt),[3,2,1]);assert.equal(log.events[0].details.outcome,'blank');assert.equal(log.events[1].details.selectedAnswer,'Hello');assert.equal(log.events[2].studentId,s.student.id);assert.ok(!JSON.stringify(log).includes('DO NOT STORE'));
 const report=(await request(e,'/api/admin/overview',{token:a.token})).data;assert.equal(report.stats.correctCount,1);assert.equal(report.stats.incorrectCount,1);assert.equal(report.stats.blankCount,1);e.DB.close();
});
test('online presence expires, deduplicates tabs and disappears on logout or disabled access',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,t=(await studentLogin(e)).data,a=(await adminLogin(e)).data;
 const ping=token=>request(e,'/api/presence',{token,body:{state:'active',lesson:'lessons/a2/day-01.html',activity:'6'}});
 await ping(s.token);await ping(t.token);let live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.online.length,1);assert.equal(live.online[0].activity,'6');
 await request(e,'/api/presence',{token:s.token,body:{state:'hidden',lesson:'panel',activity:'home'}});assert.equal((await request(e,'/api/admin/presence',{token:a.token})).data.online.length,1);
 await request(e,'/api/auth/logout',{token:t.token,method:'POST'});assert.equal((await request(e,'/api/admin/presence',{token:a.token})).data.online.length,0);
 await ping(s.token);await e.DB.prepare('UPDATE presence SET seen_at=?').bind(new Date(Date.now()-76000).toISOString()).run();assert.equal((await request(e,'/api/admin/presence',{token:a.token})).data.online.length,0);
 await ping(s.token);await request(e,'/api/admin/students/'+s.student.id,{token:a.token,body:{enabled:false}});assert.equal((await request(e,'/api/admin/presence',{token:a.token})).data.online.length,0);e.DB.close();
});
test('log cursor pagination, question outcome filtering, CSV and detail agree',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data;
 for(const event of [question(),question('correct','Hello'),question('blank','')])await request(e,'/api/events',{token:s.token,body:{events:[event]}});
 const page=(await request(e,'/api/admin/logs?limit=2&eventType=question_result',{token:a.token})).data;assert.equal(page.events.length,2);assert.ok(page.nextCursor);
 const next=(await request(e,'/api/admin/logs?limit=2&eventType=question_result&cursor='+page.nextCursor,{token:a.token})).data;assert.equal(next.events.length,1);assert.ok(page.events.every(x=>x.id!==next.events[0].id));
 const filtered=(await request(e,'/api/admin/logs?outcome=incorrect&group=A2',{token:a.token})).data;assert.equal(filtered.events.length,1);assert.equal(filtered.events[0].details.selectedAnswer,'wrong');
 const csv=await request(e,'/api/admin/logs.csv?outcome=correct',{token:a.token});assert.equal(csv.status,200);assert.match(csv.data,/Hello/);assert.ok(!csv.data.includes('wrong'));
 const detail=(await request(e,'/api/admin/students/'+s.student.id,{token:a.token})).data;assert.equal(detail.metrics.resultCount,3);assert.equal(detail.events.filter(x=>x.details).length,3);e.DB.close();
});
test('result validation rejects malformed/oversized reports and keeps separate receipt/client times',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data;
 let event=question('blank','non-empty');assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[event]}})).status,400);
 event=question();event.details.prompt='x'.repeat(1601);assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[event]}})).status,400);
 event=question();event.occurredAt=new Date(Date.now()-3600000).toISOString();assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[event]}})).status,200);
 const logged=(await request(e,'/api/admin/logs?eventType=question_result',{token:a.token})).data.events[0];assert.equal(logged.occurredAt,event.occurredAt);assert.ok(logged.createdAt>logged.occurredAt);
 event=question();event.occurredAt='2100-01-01T00:00:00Z';assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[event]}})).status,400);e.DB.close();
});
test('all detailed reports stay administrator-only; presence requires a valid unexpired student session',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data;
 for(const path of ['/api/admin/logs','/api/admin/logs.csv','/api/admin/presence']){assert.equal((await request(e,path)).status,401);assert.equal((await request(e,path,{token:s.token})).status,403);}
 await e.DB.prepare('UPDATE sessions SET expires_at=?').bind('2000-01-01T00:00:00.000Z').run();assert.equal((await request(e,'/api/presence',{token:s.token,body:{state:'active',lesson:'panel',activity:'home'}})).status,401);e.DB.close();
});
const engagement=(overrides={})=>({tabId:crypto.randomUUID(),pagePath:'lessons/a2/day-01.html',pageTitle:'A2 · Ders 1',screenId:'practice-6',screenTitle:'6 · Kelime çalışması',section:'Alıştırma',visibility:'visible',focused:true,idleSeconds:0,lastInteractionAt:new Date().toISOString(),interaction:'pointer',status:'working',...overrides});
const contextPresence=(e,token,context)=>request(e,'/api/presence',{token,body:{state:'active',lesson:'lessons/a2/day-01.html',activity:context.screenId,context}});
test('engagement status derives exact inactivity boundary and keeps background/focus details',()=>{
 const now='2026-10-19T12:00:00.000Z',base=engagement({lastInteractionAt:now});
 assert.equal(validateContext({...base,idleSeconds:59},now).status,'working');
 assert.equal(validateContext({...base,idleSeconds:60},now).status,'reading');
 assert.equal(validateContext({...base,idleSeconds:329},now).status,'reading');
 const abandoned=validateContext({...base,idleSeconds:330,visibility:'hidden',focused:false},now);
 assert.equal(abandoned.status,'left_open');assert.equal(abandoned.visibility,'hidden');assert.equal(abandoned.focused,false);
 assert.equal(validateContext({...base,visibility:'hidden'},now).status,'background');
 assert.equal(validateContext({...base,focused:false},now).status,'unfocused');
 assert.equal(validateContext(base,now,'page_leave').status,'leaving');
});
test('same session has independent tabs, online is active students only, and stale is unknown',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data,one=engagement(),two=engagement({screenId:'reading',screenTitle:'Okuma',visibility:'hidden',focused:false,idleSeconds:330});
 assert.equal((await contextPresence(e,s.token,one)).status,200);assert.equal((await contextPresence(e,s.token,two)).status,200);
 let live=(await request(e,'/api/admin/presence',{token:a.token})).data;
 assert.equal(live.online.length,1);assert.equal(live.tabs.length,2);assert.equal(live.summary.working,1);assert.equal(live.summary.leftOpen,1);assert.equal(live.inactiveAfterSeconds,330);
 assert.equal(live.tabs.find(x=>x.tabId===two.tabId).screenTitle,'Okuma');
 await e.DB.prepare('UPDATE tab_presence SET seen_at=? WHERE tab_id=?').bind(new Date(Date.now()-76000).toISOString(),one.tabId).run();
 live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.online.length,0);assert.equal(live.tabs.find(x=>x.tabId===one.tabId).status,'unknown');assert.equal(live.summary.stale,1);
 await request(e,'/api/auth/logout',{token:s.token,method:'POST'});assert.equal((await request(e,'/api/admin/presence',{token:a.token})).data.tabs.length,0);e.DB.close();
});
test('presence inactivity advances only while signal is recent and stops granting active online status at sixty seconds',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data,c=engagement({idleSeconds:59});await contextPresence(e,s.token,c);
 await e.DB.prepare('UPDATE tab_presence SET seen_at=?').bind(new Date(Date.now()-2000).toISOString()).run();
 let live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.online.length,0);assert.equal(live.tabs[0].status,'reading');
 await contextPresence(e,s.token,{...c,idleSeconds:329});await e.DB.prepare('UPDATE tab_presence SET seen_at=?').bind(new Date(Date.now()-2000).toISOString()).run();
 live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.tabs[0].status,'left_open');
 await e.DB.prepare('UPDATE tab_presence SET seen_at=?').bind(new Date(Date.now()-76000).toISOString()).run();
 live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.tabs[0].status,'unknown');assert.equal(live.tabs[0].lastStatus,'reading');e.DB.close();
});
test('all durable transition contexts appear in admin logs and CSV; replay never makes anyone online',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data;
 const types=['tab_visible','tab_hidden','window_focus','window_blur','idle_start','abandoned','resumed','page_leave'];
 for(const type of types){const event={eventId:crypto.randomUUID(),type,lesson:'lessons/a2/day-01.html',activity:'practice-6',occurredAt:new Date(Date.now()-3600000).toISOString(),context:engagement({pageTitle:'=HYPERLINK',idleSeconds:type==='abandoned'?330:0}),privateNotes:'NEVER STORE THIS',keys:'secret'};
   for(let i=0;i<2;i++)assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[event]}})).status,200);
 }
 const live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.online.length,0);assert.equal(live.tabs.length,0);
 const log=(await request(e,'/api/admin/logs',{token:a.token})).data.events.filter(x=>types.includes(x.type));assert.equal(log.length,8);assert.ok(log.every(x=>x.context?.screenTitle==='6 · Kelime çalışması'));assert.equal(log.find(x=>x.type==='page_leave').context.status,'leaving');assert.equal(log.find(x=>x.type==='abandoned').context.status,'left_open');assert.ok(log.every(x=>x.createdAt>x.occurredAt));assert.ok(!JSON.stringify(log).includes('NEVER STORE'));
 const csv=(await request(e,'/api/admin/logs.csv?eventType=abandoned',{token:a.token})).data;assert.match(csv,/Alt ekran başlığı/);assert.match(csv,/6 · Kelime çalışması/);assert.match(csv,/'=HYPERLINK/);assert.match(csv,/left_open/);assert.match(csv,/330/);
 assert.equal((await request(e,'/api/admin/logs.csv',{token:s.token})).status,403);e.DB.close();
});
test('context validation rejects external URLs, oversized labels and invalid state without storing extra private fields',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data;
 for(const patch of [{pagePath:'https://other.example/private?token=secret'},{pagePath:'lessons/a2/day-01.html?answer=private'},{tabId:'same-tab'},{pageTitle:'x'.repeat(181)},{screenTitle:'<script>'},{idleSeconds:-1},{idleSeconds:330.5},{focused:'true'},{visibility:'foreground'},{lastInteractionAt:'2099-01-01T00:00:00.000Z'},{interaction:'typed-password'},{status:'offline'}])assert.equal((await contextPresence(e,s.token,engagement(patch))).status,400,JSON.stringify(patch));
 assert.equal((await contextPresence(e,s.token,engagement({pagePath:'/ingilizce-dersler/lessons/a2/day-01.html',privateNote:'DONT STORE',typedValue:'secret'}))).status,200);
 const row=await e.DB.prepare('SELECT * FROM tab_presence').first();assert.equal(row.page_path,'lessons/a2/day-01.html');assert.ok(!JSON.stringify(row).includes('DONT STORE'));e.DB.close();
});
test('hidden, unfocused and inactive heartbeat context accrues no active credit; current working context still does',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data;
 for(const c of [engagement({visibility:'hidden'}),engagement({focused:false}),engagement({idleSeconds:60}),engagement({idleSeconds:330})]){
   await e.DB.prepare('UPDATE students SET last_credited_at=? WHERE id=?').bind(new Date(Date.now()-30000).toISOString(),'a2-001').run();
   assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[{eventId:crypto.randomUUID(),type:'heartbeat',lesson:'lessons/a2/day-01.html',activity:'practice-6',activeSeconds:30,context:c}]}})).status,200);
 }
 assert.equal((await e.DB.prepare("SELECT SUM(active_seconds) AS seconds FROM events WHERE type='heartbeat'").first()).seconds,0);
 await e.DB.prepare('UPDATE students SET last_credited_at=? WHERE id=?').bind(new Date(Date.now()-30000).toISOString(),'a2-001').run();await request(e,'/api/events',{token:s.token,body:{events:[{eventId:crypto.randomUUID(),type:'heartbeat',lesson:'lessons/a2/day-01.html',activity:'practice-6',activeSeconds:30,context:engagement()}]}});
 assert.ok((await e.DB.prepare("SELECT SUM(active_seconds) AS seconds FROM events WHERE type='heartbeat'").first()).seconds>=29);e.DB.close();
});
test('expired and disabled sessions exclude all their recent tab records',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data;await contextPresence(e,s.token,engagement());
 await e.DB.prepare('UPDATE sessions SET expires_at=? WHERE token_hash=?').bind('2000-01-01T00:00:00.000Z',await digest(s.token)).run();assert.equal((await request(e,'/api/admin/presence',{token:a.token})).data.tabs.length,0);assert.equal((await contextPresence(e,s.token,engagement())).status,401);
 const t=(await studentLogin(e)).data;await contextPresence(e,t.token,engagement());await request(e,'/api/admin/students/a2-001',{token:a.token,body:{enabled:false}});assert.equal((await request(e,'/api/admin/presence',{token:a.token})).data.tabs.length,0);e.DB.close();
});
test('tab display retains unknown signals for thirty minutes and leaving signals for only seventy-five seconds',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data;
 const retained=engagement(),old=engagement(),leaving=engagement({status:'leaving'});
 for(const c of [retained,old,leaving])await contextPresence(e,s.token,c);
 await e.DB.prepare('UPDATE tab_presence SET seen_at=? WHERE tab_id=?').bind(new Date(Date.now()-1799000).toISOString(),retained.tabId).run();
 await e.DB.prepare('UPDATE tab_presence SET seen_at=? WHERE tab_id=?').bind(new Date(Date.now()-1801000).toISOString(),old.tabId).run();
 let live=(await request(e,'/api/admin/presence',{token:a.token})).data;
 assert.equal(live.tabWindowSeconds,1800);assert.equal(live.tabs.length,2);assert.equal(live.tabs.find(x=>x.tabId===retained.tabId).status,'unknown');assert.equal(live.tabs.find(x=>x.tabId===leaving.tabId).status,'leaving');
 await e.DB.prepare('UPDATE tab_presence SET seen_at=? WHERE tab_id=?').bind(new Date(Date.now()-76000).toISOString(),leaving.tabId).run();
 live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.tabs.length,1);assert.equal(live.summary.tabs,1);assert.equal(live.summary.stale,1);e.DB.close();
});
test('contextual old heartbeat never credits work on retry, while legacy delayed heartbeat remains compatible',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data;
 const old={eventId:crypto.randomUUID(),type:'heartbeat',lesson:'lessons/a2/day-01.html',activity:'practice-6',activeSeconds:30,occurredAt:new Date(Date.now()-76000).toISOString(),context:engagement()};
 await e.DB.prepare('UPDATE students SET last_credited_at=? WHERE id=?').bind(new Date(Date.now()-30000).toISOString(),'a2-001').run();
 for(let i=0;i<2;i++)assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[old]}})).status,200);
 assert.equal((await e.DB.prepare("SELECT SUM(active_seconds) AS seconds FROM events WHERE type='heartbeat'").first()).seconds,0);
 const {context,...legacy}=old;await e.DB.prepare('UPDATE students SET last_credited_at=? WHERE id=?').bind(new Date(Date.now()-30000).toISOString(),'a2-001').run();
 await request(e,'/api/events',{token:s.token,body:{events:[{...legacy,eventId:crypto.randomUUID()}]}});
 assert.ok((await e.DB.prepare("SELECT SUM(active_seconds) AS seconds FROM events WHERE type='heartbeat'").first()).seconds>=29);e.DB.close();
});
test('context page location must match event or presence lesson; panel path is normalized and accepted',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data;
 assert.equal((await contextPresence(e,s.token,engagement({pagePath:'lessons/b1/day-01.html'}))).status,400);
 assert.equal((await request(e,'/api/events',{token:s.token,body:{events:[{eventId:crypto.randomUUID(),type:'page_view',lesson:'lessons/a2/day-01.html',activity:'',context:engagement({pagePath:'index.html'})}]}})).status,400);
 for(const pagePath of ['index.html','/ingilizce-dersler/','panel'])assert.equal((await request(e,'/api/presence',{token:s.token,body:{state:'active',lesson:'panel',activity:'A2',context:engagement({pagePath})}})).status,200);
 assert.equal((await request(e,'/api/presence',{token:s.token,body:{state:'active',lesson:'panel',activity:'A2',context:engagement()}})).status,400);e.DB.close();
});
test('presence monotonic sequence ignores reversed arrivals and permits a newer bfcache restoration',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,a=(await adminLogin(e)).data,c=engagement();
 const ping=(sequence,context)=>request(e,'/api/presence',{token:s.token,body:{state:context.status==='leaving'?'hidden':'active',lesson:'lessons/a2/day-01.html',activity:context.screenId,context,sequence}});
 assert.equal((await ping(2,{...c,status:'leaving'})).status,200);
 const original=await e.DB.prepare('SELECT sequence,seen_at FROM tab_presence').first();
 assert.equal((await ping(1,c)).status,200);assert.equal((await ping(2,c)).status,200);assert.equal((await ping(0,c)).status,200);
 let row=await e.DB.prepare('SELECT sequence,seen_at,status FROM tab_presence').first();assert.equal(row.status,'leaving');assert.equal(row.sequence,2);assert.equal(row.seen_at,original.seen_at);
 let live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.online.length,0);assert.equal(live.tabs[0].status,'leaving');
 assert.equal((await ping(3,c)).status,200);row=await e.DB.prepare('SELECT sequence,status FROM tab_presence').first();assert.equal(row.status,'working');assert.equal(row.sequence,3);
 live=(await request(e,'/api/admin/presence',{token:a.token})).data;assert.equal(live.online.length,1);assert.equal(live.tabs.length,1);assert.ok(!Object.hasOwn(live.tabs[0],'sequence'));e.DB.close();
});
test('presence sequence zero preserves old contextual clients and malformed sequences are rejected',async()=>{
 const e=await setup(),s=(await studentLogin(e)).data,c=engagement();await contextPresence(e,s.token,c);await contextPresence(e,s.token,{...c,visibility:'hidden'});
 let row=await e.DB.prepare('SELECT sequence,status FROM tab_presence').first();assert.equal(row.sequence,0);assert.equal(row.status,'background');
 await contextPresence(e,s.token,c);row=await e.DB.prepare('SELECT sequence,status FROM tab_presence').first();assert.equal(row.status,'working');
 for(const sequence of [-1,1.5,2147483648,'1',null])assert.equal((await request(e,'/api/presence',{token:s.token,body:{state:'active',lesson:'lessons/a2/day-01.html',activity:c.screenId,context:c,sequence}})).status,400);
 e.DB.close();
});
