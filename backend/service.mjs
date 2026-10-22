import {normalizeName,digest,newToken,passwordHash,verifyPassword,aliasesFor} from './crypto.mjs';
import {CLIENT_TYPES,validLocation,validateQuestion,clientTime,validateContext,validateContextLocation,PRESENCE_WINDOW_SECONDS,CONTEXT_FIELDS,contextValues,onlineStudents,queryLogs,LOG_COLUMNS,LOG_JOIN,mapEvent} from './detailed-logs.mjs';
import {validateLearning,queryLearning} from './learning-insights.mjs';
import {listTeacherGuides,readTeacherGuide} from './teacher-guides.mjs';
import {studentExamResults,adminExamResults} from './exam-results.mjs';
import {recordExamResultView,adminExamResultViews} from './exam-result-views.mjs';
const iso = () => new Date().toISOString();
const fail = (status,message) => { throw Object.assign(new Error(message),{status}); };
const reply = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const publicStudent = s => ({id:s.id,name:s.name,group:s.group_name,enabled:!!s.enabled,firstLogin:s.first_login,lastLogin:s.last_login});
async function rows(db,sql,args=[]) { return (await db.prepare(sql).bind(...args).all()).results || []; }
async function first(db,sql,args=[]) { return db.prepare(sql).bind(...args).first(); }
async function run(db,sql,args=[]) { return db.prepare(sql).bind(...args).run(); }
async function jsonBody(req,max=65536) {
  if (!(req.headers.get('Content-Type') || '').startsWith('application/json')) fail(415,'JSON biçimi gerekli.');
  const body=await req.text(); if(new TextEncoder().encode(body).length>max) fail(413,'İstek çok büyük.');
  try { const x=JSON.parse(body);if(!x||typeof x!=='object'||Array.isArray(x))throw 0;return x; } catch {fail(400,'Geçersiz istek.');}
}
async function adminHash(env) { return (await first(env.DB,"SELECT value FROM settings WHERE key='admin_password_hash'"))?.value || env.ADMIN_PASSWORD_HASH; }
async function authenticate(req,env,admin=false) {
  const value=req.headers.get('Authorization') || '';
  if(!/^Bearer [a-f0-9]{64}$/.test(value)) fail(401,'Oturum açmanız gerekiyor.');
  const hash=await digest(value.slice(7));
  const session=await first(env.DB,'SELECT s.*, st.name,st.group_name,st.enabled,st.first_login,st.last_login FROM sessions s LEFT JOIN students st ON st.id=s.student_id WHERE token_hash=? AND expires_at>?',[hash,iso()]);
  if(!session || (session.role==='student' && !session.enabled)) fail(401,'Oturumunuz sona erdi. Yeniden giriş yapın.');
  if(admin && session.role!=='admin') fail(403,'Bu alan yalnızca yönetici içindir.');
  return session;
}
async function rateKey(req,scope) {return digest(`${req.headers.get('CF-Connecting-IP') || 'local'}:${scope}`);}
async function checkRate(db,key,max) {
  const row=await first(db,'SELECT attempts,reset_at FROM rate_limits WHERE key=?',[key]);
  if(row && row.reset_at>iso() && row.attempts>=max) fail(429,'Çok fazla deneme yapıldı. On dakika sonra tekrar deneyin.');
}
async function addFailure(db,key) {
  const now=iso(),reset=new Date(Date.now()+600000).toISOString();
  await run(db,'INSERT INTO rate_limits(key,attempts,reset_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN reset_at<=? THEN 1 ELSE attempts+1 END, reset_at=CASE WHEN reset_at<=? THEN excluded.reset_at ELSE reset_at END',[key,reset,now,now]);
}
async function createSession(db,role,student) {
  const token=newToken(),hash=await digest(token),now=iso();
  const expiresAt=new Date(Date.now()+(role==='admin'?2:12)*3600000).toISOString();
  const statements=[db.prepare('INSERT INTO sessions(token_hash,role,student_id,created_at,expires_at,last_seen) VALUES(?,?,?,?,?,?)').bind(hash,role,student?.id || null,now,expiresAt,now)];
  if(student) {
    statements.push(db.prepare('UPDATE students SET first_login=COALESCE(first_login,?),last_login=? WHERE id=?').bind(now,now,student.id));
    statements.push(db.prepare("INSERT INTO events(event_id,student_id,type,lesson,created_at) VALUES(?,?,'login','panel',?)").bind(crypto.randomUUID(),student.id,now));
  }
  await db.batch(statements);
  return {token,role,expiresAt,...(student?{student:publicStudent(student)}:{})};
}
export async function importStudents(env,students) {
  if(!Array.isArray(students)||students.length<1||students.length>500)fail(400,'Öğrenci listesi 1–500 kayıt içermeli.');
  const seen=new Set(),batch=[],now=iso();
  for(const s of students) {
    if(!/^[a-z0-9-]{2,64}$/.test(s.id||'')||seen.has(s.id)||typeof s.name!=='string'||s.name.trim().length<3||s.name.length>120||!['A1','A2','B1','YDS'].includes(s.group))fail(400,'Geçersiz veya yinelenmiş öğrenci kaydı.');
    if(s.aliases && (!Array.isArray(s.aliases)||s.aliases.length>12||s.aliases.some(x=>typeof x!=='string'||x.length>120)))fail(400,'Geçersiz alternatif yazım.');
    seen.add(s.id);
    batch.push(env.DB.prepare('INSERT INTO students(id,name,group_name,enabled,created_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,group_name=excluded.group_name').bind(s.id,s.name.trim(),s.group,s.enabled===false?0:1,now));
    batch.push(env.DB.prepare('DELETE FROM student_aliases WHERE student_id=?').bind(s.id));
    for(const a of aliasesFor(s))batch.push(env.DB.prepare('INSERT INTO student_aliases(alias,student_id) VALUES(?,?)').bind(await digest(a),s.id));
  }
  // D1 limits a single batch: each student remains an atomic upsert + alias replacement.
  let current=[];
  for(const statement of batch) {
    if(statement.sql?.startsWith('INSERT INTO students') && current.length){await env.DB.batch(current);current=[];}
    current.push(statement);
  }
  if(current.length)await env.DB.batch(current);
  return students.length;
}
function filters(url) {
  const p=url.searchParams,group=p.get('group')||'',q=(p.get('q')||'').slice(0,120),visit=p.get('visit')||'all';
  if(group&&!['A1','A2','B1','YDS'].includes(group))fail(400,'Geçersiz sınıf.');
  if(!['all','never','visited'].includes(visit))fail(400,'Geçersiz giriş filtresi.');
  const from=p.get('from')||'',to=p.get('to')||'';
  function validDate(x){return !x || /^\d{4}-\d{2}-\d{2}$/.test(x)&&!isNaN(Date.parse(`${x}T00:00:00Z`))&&new Date(`${x}T00:00:00Z`).toISOString().startsWith(x);}
  if(!validDate(from)||!validDate(to)||from&&to&&from>to)fail(400,'Geçerli bir tarih aralığı seçin.');
  // Date filters are classroom dates in Europe/Istanbul, including the entire last day.
  const start=from?new Date(`${from}T00:00:00+03:00`).toISOString():'0000';
  const end=to?new Date(Date.parse(`${to}T00:00:00+03:00`)+86400000).toISOString():'9999';
  return {group,q:normalizeName(q),visit,start,end,from,to};
}
async function overview(env,url) {
  const f=filters(url);
  const [live,results]=await Promise.all([onlineStudents(env),rows(env.DB,"SELECT student_id,SUM(outcome='correct') AS correctCount,SUM(outcome='incorrect') AS incorrectCount,SUM(outcome='blank') AS blankCount,COUNT(*) AS resultCount FROM assessment_results WHERE created_at>=? AND created_at<? GROUP BY student_id",[f.start,f.end])]);
  const onlineMap=new Map(live.online.map(x=>[x.id,x])),resultMap=new Map(results.map(x=>[x.student_id,x]));
  const all=await rows(env.DB,`SELECT st.*,
    COUNT(CASE WHEN e.type='login' THEN 1 END) AS logins,
    SUM(CASE WHEN e.type='heartbeat' THEN e.active_seconds ELSE 0 END) AS seconds,
    COUNT(DISTINCT CASE WHEN e.lesson!='panel' THEN e.lesson END) AS lessons,
    COUNT(e.id) AS events,MAX(e.created_at) AS last_activity,
    MAX(CASE WHEN e.created_at>=? AND e.type='heartbeat' THEN e.created_at END) AS active_today
    FROM students st LEFT JOIN events e ON st.id=e.student_id AND e.created_at>=? AND e.created_at<? GROUP BY st.id`,[new Date(new Date().toLocaleDateString('en-CA',{timeZone:'Europe/Istanbul'})+'T00:00:00+03:00').toISOString(),f.start,f.end]);
  let students=all.map(s=>{const live=onlineMap.get(s.id),r=resultMap.get(s.id);return {...publicStudent(s),loginCount:s.logins,everVisited:!!s.first_login,periodVisited:s.events>0,activeSeconds:s.seconds||0,lessonCount:s.lessons,eventCount:s.events,lastActivity:s.last_activity,activeToday:!!s.active_today,online:!!live,lastSeen:live?.lastSeen||null,currentLesson:live?.lesson||null,currentActivity:live?.activity||null,correctCount:r?.correctCount||0,incorrectCount:r?.incorrectCount||0,blankCount:r?.blankCount||0,resultCount:r?.resultCount||0}});
  if(f.group)students=students.filter(s=>s.group===f.group);
  if(f.q)students=students.filter(s=>normalizeName(s.name).includes(f.q));
  // "Never" is lifetime absence of login; dates never turn an earlier visitor into "never".
  if(f.visit==='never')students=students.filter(s=>!s.everVisited);
  if(f.visit==='visited')students=students.filter(s=>s.everVisited);
  students.sort((a,b)=>a.name.localeCompare(b.name,'tr'));
  const ids=new Set(students.map(s=>s.id));
  let lessonRows=[];
  if(ids.size)lessonRows=await rows(env.DB,`SELECT student_id,lesson,COUNT(*) AS events,SUM(active_seconds) AS seconds FROM events WHERE created_at>=? AND created_at<? AND lesson!='panel' GROUP BY student_id,lesson`,[f.start,f.end]);
  const lessonMap=new Map();
  for(const x of lessonRows)if(ids.has(x.student_id)) {const l=lessonMap.get(x.lesson)||{path:x.lesson,title:x.lesson,visitors:0,eventCount:0,activeSeconds:0};l.visitors++;l.eventCount+=x.events;l.activeSeconds+=x.seconds||0;lessonMap.set(x.lesson,l);}
  return {stats:{total:students.length,visited:students.filter(s=>s.periodVisited).length,never:students.filter(s=>!s.everVisited).length,activeToday:students.filter(s=>s.activeToday).length,loginCount:students.reduce((n,s)=>n+s.loginCount,0),activeSeconds:students.reduce((n,s)=>n+s.activeSeconds,0),online:students.filter(s=>s.online).length,correctCount:students.reduce((n,s)=>n+s.correctCount,0),incorrectCount:students.reduce((n,s)=>n+s.incorrectCount,0),blankCount:students.reduce((n,s)=>n+s.blankCount,0)},groups:[...new Set(all.map(s=>s.group_name))].sort(),students,lessons:[...lessonMap.values()].sort((a,b)=>b.visitors-a.visitors),filters:{from:f.from,to:f.to,neverMeaning:'all-time'}};
}
function csvCell(x) {
  let text=String(x??''); if(/^[=+@\-\t\r]/.test(text))text="'"+text;
  return '"'+text.replace(/"/g,'""')+'"';
}
export async function handleRequest(req,env) {
  const url=new URL(req.url),allowed=env.FRONTEND_ORIGIN || 'https://feanoria-web.github.io';
  const origin=req.headers.get('Origin');
  const local=env.LOCAL===true && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin||'');
  let response;
  if(origin && origin!==allowed && !local)response=reply({error:'Bu kaynaktan erişim izni yok.'},403);
  else if(req.method==='OPTIONS')response=new Response(null,{status:204});
  else try {response=await route(req,env,url);}catch(error){response=reply({error:error.status?error.message:'İşlem tamamlanamadı. Lütfen tekrar deneyin.'},error.status||500);if(!error.status&&env.LOCAL)console.error(error);}
  const headers=new Headers(response.headers);
  headers.set('Cache-Control','no-store');headers.set('Vary','Origin');headers.set('X-Content-Type-Options','nosniff');
  if(origin&&(origin===allowed||local))headers.set('Access-Control-Allow-Origin',origin);
  headers.set('Access-Control-Allow-Methods','GET,POST,OPTIONS');headers.set('Access-Control-Allow-Headers','Content-Type,Authorization');
  return new Response(response.body,{status:response.status,headers});
}
async function route(req,env,url) {
  const path=url.pathname.replace(/\/$/,'');
  if(req.method==='GET'&&path==='/api/health')return reply({ok:true,configured:!!await adminHash(env)});
  if(req.method==='POST'&&path==='/api/admin/setup'&&env.LOCAL===true) {
    if(req.headers.get('Origin')!==url.origin)fail(403,'Kurulumu yerel kurulum sayfasından açın.');
    if(await adminHash(env))fail(409,'Yönetici zaten kurulmuş.');
    const {newPassword}=await jsonBody(req,1000);
    if(typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)fail(400,'Şifreniz 12–128 karakter olmalı.');
    const result=await run(env.DB,"INSERT OR IGNORE INTO settings(key,value) VALUES('admin_password_hash',?)",[await passwordHash(newPassword)]);
    if(!result.meta?.changes)fail(409,'Yönetici zaten kurulmuş.');
    return reply({ok:true});
  }
  if(req.method==='POST'&&(path==='/api/auth/login'||path==='/api/admin/login')) {
    const {password}=await jsonBody(req,1024);
    if(typeof password!=='string'||password.length<2||password.length>200)fail(400,'Şifrenizi kontrol edin.');
    const isAdmin=path==='/api/admin/login',key=await rateKey(req,isAdmin?'admin':normalizeName(password));
    await checkRate(env.DB,key,isAdmin?6:10);
    if(isAdmin) {
      const hash=await adminHash(env);if(!hash)fail(503,'Yönetici şifresi henüz kurulmamış.');
      if(!await verifyPassword(password,hash)){await addFailure(env.DB,key);fail(401,'Şifre doğru değil.');}
      await run(env.DB,'DELETE FROM rate_limits WHERE key=?',[key]);
      return reply(await createSession(env.DB,'admin'));
    }
    const matches=await rows(env.DB,'SELECT st.* FROM students st JOIN student_aliases a ON a.student_id=st.id WHERE a.alias=? AND st.enabled=1',[await digest(normalizeName(password))]);
    if(matches.length!==1) {await addFailure(env.DB,key);fail(401,matches.length>1?'Lütfen adınızın ve soyadınızın tamamını yazın.':'Bilgilerinizi kontrol edin veya öğretmeninize danışın.');}
    await run(env.DB,'DELETE FROM rate_limits WHERE key=?',[key]);
    return reply(await createSession(env.DB,'student',matches[0]));
  }
  if(req.method==='GET'&&path==='/api/auth/me') {
    const s=await authenticate(req,env);return reply({role:s.role,expiresAt:s.expires_at,...(s.role==='student'?{student:publicStudent({...s,id:s.student_id})}:{})});
  }
  if(req.method==='POST'&&path==='/api/auth/logout') {
    const s=await authenticate(req,env),writes=[];
    if(s.role==='student')writes.push(env.DB.prepare("INSERT INTO events(event_id,student_id,type,lesson,created_at) VALUES(?,?,'logout','panel',?)").bind(crypto.randomUUID(),s.student_id,iso()));
    writes.push(env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(s.token_hash));await env.DB.batch(writes);return reply({ok:true});
  }
  if(req.method==='GET'&&path==='/api/exam-results') {
    const s=await authenticate(req,env);if(s.role!=='student')fail(403,'Öğrenci oturumu gerekli.');
    return reply(await studentExamResults(env,s.student_id));
  }
  if(req.method==='POST'&&path==='/api/exam-results/view') {
    const s=await authenticate(req,env);if(s.role!=='student')fail(403,'Öğrenci oturumu gerekli.');
    const {viewId}=await jsonBody(req,1000);
    await recordExamResultView(env,s.student_id,viewId);
    return reply({ok:true});
  }
  if(req.method==='POST'&&path==='/api/presence') {
    const s=await authenticate(req,env);if(s.role!=='student')fail(403,'Öğrenci oturumu gerekli.');
    const {state,lesson,activity,context:rawContext,sequence=0}=await jsonBody(req,4000);
    if(!['active','idle','hidden'].includes(state)||!validLocation(lesson,activity))fail(400,'Geçersiz etkinlik konumu.');
    if(!Number.isInteger(sequence)||sequence<0||sequence>2147483647)fail(400,'Geçersiz sekme sinyal sırası.');
    const now=iso(),context=validateContextLocation(validateContext(rawContext,now),lesson);
    if(context) {
      // Pagehide may race an earlier request. Only the newer page-instance
      // snapshot can change state or freshness; zero keeps old clients usable.
      await run(env.DB,`INSERT INTO tab_presence(session_hash,student_id,lesson,activity,${CONTEXT_FIELDS},sequence,seen_at)
        VALUES(${new Array(18).fill('?').join(',')}) ON CONFLICT(session_hash,tab_id) DO UPDATE SET
        lesson=excluded.lesson,activity=excluded.activity,page_path=excluded.page_path,page_title=excluded.page_title,
        screen_id=excluded.screen_id,screen_title=excluded.screen_title,section=excluded.section,
        visibility=excluded.visibility,focused=excluded.focused,idle_seconds=excluded.idle_seconds,
        last_interaction_at=excluded.last_interaction_at,interaction=excluded.interaction,status=excluded.status,sequence=excluded.sequence,seen_at=excluded.seen_at
        WHERE excluded.sequence>tab_presence.sequence OR (excluded.sequence=0 AND tab_presence.sequence=0)`,
        [s.token_hash,s.student_id,lesson,activity||'',...contextValues(context),sequence,now]);
    } else await run(env.DB,'INSERT INTO presence(session_hash,student_id,lesson,activity,state,seen_at) VALUES(?,?,?,?,?,?) ON CONFLICT(session_hash) DO UPDATE SET lesson=excluded.lesson,activity=excluded.activity,state=excluded.state,seen_at=excluded.seen_at',[s.token_hash,s.student_id,lesson,activity||'',state,now]);
    return reply({ok:true});
  }
  if(req.method==='POST'&&path==='/api/events') {
    const s=await authenticate(req,env);if(s.role!=='student')fail(403,'Öğrenci oturumu gerekli.');
    const {events}=await jsonBody(req,262144);
    if(!Array.isArray(events)||events.length<1||events.length>10)fail(400,'Bir istekte 1–10 etkinlik gönderin.');
    const validated=events.map(e=>{
      if(!e||!CLIENT_TYPES.has(e.type)||!/^[a-zA-Z0-9-]{16,80}$/.test(e.eventId||'')||!validLocation(e.lesson,e.activity??''))fail(400,'Geçersiz etkinlik kaydı.');
      const receivedAt=iso(),context=validateContextLocation(validateContext(e.context,receivedAt,e.type),e.lesson),occurredAt=clientTime(e.occurredAt,receivedAt);
      const currentContext=!context||context.status==='working'&&(!occurredAt||Date.parse(receivedAt)-Date.parse(occurredAt)<=PRESENCE_WINDOW_SECONDS*1000);
      const details=e.type==='question_result'?validateQuestion(e.details):null,learning=validateLearning(e.learning,e.type,details);
      return {...e,context,activeSeconds:e.type==='heartbeat'&&currentContext?Math.max(0,Math.min(30,Math.floor(Number(e.activeSeconds)||0))):0,occurredAt,details,learning};
    });
    const now=iso();
    const writes=[];
    for(const e of validated) {
      // SQL computes and updates the shared student clock in the same atomic batch.
      // Parallel sessions and duplicate/offline retries cannot double-credit elapsed time.
      writes.push(env.DB.prepare(`INSERT OR IGNORE INTO events(event_id,student_id,type,lesson,activity,active_seconds,created_at,occurred_at)
        VALUES(?,?,?,?,?,MIN(?,MAX(0,CAST((julianday(?) - julianday(COALESCE((SELECT last_credited_at FROM students WHERE id=?),?)))*86400+0.001 AS INTEGER))),?,?)`)
        .bind(e.eventId,s.student_id,e.type,e.lesson,e.activity||'',e.activeSeconds,now,s.student_id,s.created_at,now,e.occurredAt));
      if(e.type==='heartbeat')writes.push(env.DB.prepare('UPDATE students SET last_credited_at=? WHERE id=? AND changes()>0').bind(now,s.student_id));
      if(e.details){const d=e.details;writes.push(env.DB.prepare(`INSERT OR IGNORE INTO assessment_results(event_id,student_id,lesson,question_id,prompt,selected_answer,correct_answer,outcome,assessment_kind,attempt,created_at)
        SELECT e.id,?,?,?,?,?,?,?, ?, COALESCE((SELECT MAX(attempt) FROM assessment_results WHERE student_id=? AND lesson=? AND question_id=?),0)+1,?
        FROM events e WHERE e.student_id=? AND e.event_id=? AND e.type='question_result' AND e.lesson=?`)
        .bind(s.student_id,e.lesson,d.questionId,d.prompt,d.selectedAnswer,d.correctAnswer,d.outcome,d.assessmentKind,s.student_id,e.lesson,d.questionId,now,s.student_id,e.eventId,e.lesson));}
      if(e.context)writes.push(env.DB.prepare(`INSERT OR IGNORE INTO event_contexts(event_id,${CONTEXT_FIELDS})
        SELECT id,${new Array(12).fill('?').join(',')} FROM events WHERE student_id=? AND event_id=? AND type=? AND lesson=? AND created_at=?`)
        .bind(...contextValues(e.context),s.student_id,e.eventId,e.type,e.lesson,now));
      if(e.learning)writes.push(env.DB.prepare(`INSERT OR IGNORE INTO event_learning(event_id,kind,question_id,topic_id,payload_json)
        SELECT id,?,?,?,? FROM events WHERE student_id=? AND event_id=? AND type=? AND lesson=? AND created_at=?`)
        .bind(e.learning.kind,e.learning.questionId||null,e.learning.topicId||null,JSON.stringify(e.learning),s.student_id,e.eventId,e.type,e.lesson,now));
    }
    await env.DB.batch(writes);
    return reply({accepted:validated.length});
  }
  if(path.startsWith('/api/admin/')) {
    const session=await authenticate(req,env,true);
    if(req.method==='GET'&&path==='/api/admin/teacher-guides')return reply(await listTeacherGuides(env));
    if(req.method==='GET'&&path.startsWith('/api/admin/teacher-guides/'))return reply(await readTeacherGuide(env,path.slice('/api/admin/teacher-guides/'.length)));
    if(req.method==='GET'&&path==='/api/admin/exam-results')return reply(await adminExamResults(env));
    if(req.method==='GET'&&path==='/api/admin/exam-result-views')return reply(await adminExamResultViews(env));
    if(req.method==='GET'&&path==='/api/admin/presence')return reply(await onlineStudents(env));
    if(req.method==='GET'&&path==='/api/admin/learning')return reply(await queryLearning(env,url,filters(url),{columns:LOG_COLUMNS,join:LOG_JOIN,mapEvent}));
    if(req.method==='GET'&&path==='/api/admin/logs')return reply(await queryLogs(env,url,filters(url)));
    if(req.method==='GET'&&path==='/api/admin/logs.csv') {
      const data=await queryLogs(env,url,filters(url),true);
      const table=[['Öğrenci','Sınıf','Sunucu kayıt zamanı','Öğrenci cihazındaki zaman','Olay','Ders','Etkinlik','Soru','Verilen cevap','Doğru cevap','Sonuç','Deneme','Aktif saniye','Sekme kimliği','Sayfa yolu','Sayfa başlığı','Alt ekran kimliği','Alt ekran başlığı','Bölüm','Görünürlük','Pencere odakta','Hareketsiz saniye','Son hareket zamanı','Hareket türü','Çalışma durumu','Öğrenme türü','Konu','Soru süresi saniye','Soru aktif saniye','Süre kapsamı','Yardım kullanıldı','İpucu kullanıldı','Cevap açıldı','Yardım türü','Yardımdan önce denedi','Sayfa görüntüleme saniye','Sayfa aktif saniye','Sözlük kelimesi','Mola süresi dakika','Mola bitiş nedeni','Öğrenme ayrıntıları'],...data.events.map(e=>[e.studentName,e.group,e.createdAt,e.occurredAt,e.type,e.lesson,e.activity,e.details?.prompt||e.learning?.prompt,e.details?.selectedAnswer,e.details?.correctAnswer,e.details?.outcome,e.details?.attempt,e.activeSeconds,e.context?.tabId,e.context?.pagePath,e.context?.pageTitle,e.context?.screenId,e.context?.screenTitle,e.context?.section,e.context?.visibility,e.context?e.context.focused?'Evet':'Hayır':'',e.context?.idleSeconds,e.context?.lastInteractionAt,e.context?.interaction,e.context?.status,e.learning?.kind,e.learning?.topicTitle,e.learning?.wallSeconds,e.learning?.kind==='question'?e.learning.activeSeconds:null,e.learning?.timingScope,e.learning?.helpUsed,e.learning?.hintUsed,e.learning?.answerRevealed,e.learning?.helpType,e.learning?.attemptedBeforeHelp,e.learning?.viewSeconds,e.learning?.kind==='page'?e.learning.activeSeconds:null,e.learning?.term,e.learning?.durationMinutes,e.learning?.endReason,e.learning?JSON.stringify(e.learning):''])];
      return new Response('\ufeff'+table.map(r=>r.map(csvCell).join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="ayrintili-etkinlikler.csv"'}});
    }
    if(req.method==='GET'&&path==='/api/admin/overview')return reply(await overview(env,url));
    if(req.method==='GET'&&path==='/api/admin/export.csv') {
      const data=await overview(env,url);
      const table=[['Öğrenci','Sınıf','Erişim','Hiç giriş yaptı mı','İlk giriş','Son giriş','Dönemde giriş','Dönemde aktif saniye','Dönemde açılan ders','Dönemde etkinlik'],...data.students.map(s=>[s.name,s.group,s.enabled?'Açık':'Kapalı',s.everVisited?'Evet':'Hayır',s.firstLogin,s.lastLogin,s.loginCount,s.activeSeconds,s.lessonCount,s.eventCount])];
      return new Response('\ufeff'+table.map(r=>r.map(csvCell).join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="ogrenci-etkinlikleri.csv"'}});
    }
    if(req.method==='POST'&&path==='/api/admin/import') {const data=await jsonBody(req);if(!Array.isArray(data.students)||data.students.length>2)fail(400,'Öğrencileri ikişerli gruplarla aktarın.');return reply({imported:await importStudents(env,data.students)});}
    if(req.method==='POST'&&path==='/api/admin/password') {
      const {currentPassword,newPassword}=await jsonBody(req,2000);
      if(typeof currentPassword!=='string'||typeof newPassword!=='string'||newPassword.length<12||newPassword.length>128)fail(400,'Yeni yönetici şifresi en az 12, en fazla 128 karakter olmalı.');
      if(!await verifyPassword(currentPassword,await adminHash(env)))fail(401,'Mevcut şifre doğru değil.');
      await env.DB.batch([env.DB.prepare("INSERT INTO settings(key,value) VALUES('admin_password_hash',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(await passwordHash(newPassword)),env.DB.prepare("DELETE FROM sessions WHERE role='admin' AND token_hash!=?").bind(session.token_hash)]);
      return reply({ok:true});
    }
    const match=path.match(/^\/api\/admin\/students\/([a-z0-9-]+)$/);
    if(match) {
      const student=await first(env.DB,'SELECT * FROM students WHERE id=?',[match[1]]);if(!student)fail(404,'Öğrenci bulunamadı.');
      if(req.method==='POST') {
        const {enabled}=await jsonBody(req,1000);if(typeof enabled!=='boolean')fail(400,'Erişim durumu gerekli.');
        await env.DB.batch([env.DB.prepare('UPDATE students SET enabled=? WHERE id=?').bind(enabled?1:0,student.id),env.DB.prepare('DELETE FROM sessions WHERE student_id=?').bind(student.id)]);
        return reply({ok:true});
      }
      if(req.method==='GET') {
        const f=filters(url),eventRows=await rows(env.DB,`SELECT ${LOG_COLUMNS} ${LOG_JOIN} WHERE e.student_id=? AND e.created_at>=? AND e.created_at<? ORDER BY e.id DESC LIMIT 200`,[student.id,f.start,f.end]);
        const metrics=await first(env.DB,"SELECT COUNT(*) AS eventCount,SUM(CASE WHEN type='login' THEN 1 ELSE 0 END) AS loginCount,SUM(active_seconds) AS activeSeconds,COUNT(DISTINCT CASE WHEN lesson!='panel' THEN lesson END) AS lessonCount FROM events WHERE student_id=? AND created_at>=? AND created_at<?",[student.id,f.start,f.end]);
        Object.assign(metrics,await first(env.DB,"SELECT SUM(outcome='correct') AS correctCount,SUM(outcome='incorrect') AS incorrectCount,SUM(outcome='blank') AS blankCount,COUNT(*) AS resultCount FROM assessment_results WHERE student_id=? AND created_at>=? AND created_at<?",[student.id,f.start,f.end]));
        return reply({student:publicStudent(student),metrics,events:eventRows.map(mapEvent),limit:200});
      }
    }
  }
  fail(404,'Bu adres bulunamadı.');
}
