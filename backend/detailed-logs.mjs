import {normalizeName} from './crypto.mjs';
export const CLIENT_TYPES=new Set(['page_view','lesson_open','activity_view','answer_check','answer_reveal','activity_complete','vocabulary_reveal','heartbeat','question_result','audio_play','audio_complete']);
const OUTCOMES=new Set(['correct','incorrect','blank','ungraded']);
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const all=async(db,sql,args=[]) => (await db.prepare(sql).bind(...args).all()).results||[];
export function validLocation(lesson,activity='') {
  return typeof lesson==='string'&&(lesson==='panel'||/^lessons\/(a1|a2|b1|yds)\/[a-zA-Z0-9._-]+\.html$/.test(lesson))&&typeof activity==='string'&&activity.length<=120&&!/[<>\u0000-\u001f]/.test(activity);
}
export function validateQuestion(value) {
  if(!value||typeof value!=='object'||!OUTCOMES.has(value.outcome))fail(400,'Geçersiz soru sonucu.');
  const bounds={questionId:160,prompt:1600,selectedAnswer:1200,correctAnswer:1200,assessmentKind:64};
  const result={outcome:value.outcome};
  for(const [key,length] of Object.entries(bounds)) {
    if(typeof value[key]!=='string'||value[key].length>length||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value[key]))fail(400,'Geçersiz soru sonucu alanı.');
    result[key]=value[key];
  }
  if(!result.questionId.trim()||!result.prompt.trim()||!/^[a-z-]{2,64}$/.test(result.assessmentKind))fail(400,'Soru kimliği ve türü gerekli.');
  if(result.outcome==='blank'&&result.selectedAnswer.trim())fail(400,'Boş cevap sonucu tutarsız.');
  return result;
}
export function clientTime(value,now=new Date().toISOString()) {
  if(value===undefined)return null;
  if(typeof value!=='string'||value.length>35||!/^\d{4}-\d{2}-\d{2}T/.test(value))fail(400,'Geçersiz etkinlik zamanı.');
  const stamp=Date.parse(value),current=Date.parse(now);
  if(!Number.isFinite(stamp)||stamp>current+300000||stamp<current-30*86400000)fail(400,'Etkinlik zamanı kabul edilemiyor.');
  return new Date(stamp).toISOString();
}
export async function onlineStudents(env) {
  const asOf=new Date().toISOString(),cutoff=new Date(Date.now()-75000).toISOString();
  const records=await all(env.DB,`SELECT st.id,st.name,st.group_name,p.lesson,p.activity,p.seen_at
    FROM presence p JOIN students st ON st.id=p.student_id JOIN sessions s ON s.token_hash=p.session_hash
    WHERE st.enabled=1 AND p.state='active' AND p.seen_at>=? AND s.expires_at>?
    ORDER BY p.seen_at DESC`,[cutoff,asOf]);
  const seen=new Set(),online=[];
  for(const row of records)if(!seen.has(row.id)){seen.add(row.id);online.push({id:row.id,name:row.name,group:row.group_name,lesson:row.lesson,activity:row.activity,lastSeen:row.seen_at});}
  return {online,asOf,windowSeconds:75};
}
export const LOG_COLUMNS=`e.id,e.student_id,e.type,e.lesson,e.activity,e.created_at,e.occurred_at,e.active_seconds,
 st.name,st.group_name,r.question_id,r.prompt,r.selected_answer,r.correct_answer,r.outcome,r.assessment_kind,r.attempt`;
export const LOG_JOIN='FROM events e JOIN students st ON st.id=e.student_id LEFT JOIN assessment_results r ON r.event_id=e.id';
export function mapEvent(row) {
  return {id:row.id,studentId:row.student_id,studentName:row.name,group:row.group_name,type:row.type,lesson:row.lesson,activity:row.activity,createdAt:row.created_at,occurredAt:row.occurred_at||null,activeSeconds:row.active_seconds,details:row.question_id?{questionId:row.question_id,prompt:row.prompt,selectedAnswer:row.selected_answer,correctAnswer:row.correct_answer,outcome:row.outcome,assessmentKind:row.assessment_kind,attempt:row.attempt}:null};
}
export async function queryLogs(env,url,f,exporting=false) {
  const p=url.searchParams,type=p.get('eventType')||'',outcome=p.get('outcome')||'',student=p.get('student')||'',cursor=p.get('cursor')||'';
  if(type&&!CLIENT_TYPES.has(type)&&!['login','logout'].includes(type))fail(400,'Geçersiz etkinlik türü.');
  if(outcome&&!OUTCOMES.has(outcome))fail(400,'Geçersiz sonuç filtresi.');
  if(student&&!/^[a-z0-9-]{2,64}$/.test(student))fail(400,'Geçersiz öğrenci filtresi.');
  if(cursor&&(!/^\d{1,15}$/.test(cursor)||!Number.isSafeInteger(Number(cursor))))fail(400,'Geçersiz sayfa.');
  const requested=p.get('limit')||'50';if(!/^\d{1,3}$/.test(requested))fail(400,'Geçersiz sayfa boyutu.');
  const limit=exporting?10000:Math.min(100,Math.max(1,Number(requested)));
  const where=['e.created_at>=?','e.created_at<?'],args=[f.start,f.end];
  if(f.group){where.push('st.group_name=?');args.push(f.group);}
  if(student){where.push('st.id=?');args.push(student);}
  if(f.q){const records=await all(env.DB,'SELECT id,name FROM students');const ids=records.filter(s=>normalizeName(s.name).includes(f.q)).map(s=>s.id);where.push('st.id IN (SELECT value FROM json_each(?))');args.push(JSON.stringify(ids));}
  if(type){where.push('e.type=?');args.push(type);}
  if(outcome){where.push('r.outcome=?');args.push(outcome);}
  if(cursor&&!exporting){where.push('e.id<?');args.push(Number(cursor));}
  const result=await all(env.DB,`SELECT ${LOG_COLUMNS} ${LOG_JOIN} WHERE ${where.join(' AND ')} ORDER BY e.id DESC LIMIT ?`,[...args,limit+1]);
  if(exporting&&result.length>limit)fail(413,'En fazla 10.000 kayıt indirebilirsiniz. Tarih veya öğrenci filtresini daraltın.');
  return {events:result.slice(0,limit).map(mapEvent),nextCursor:result.length>limit?String(result[limit-1].id):null,limit};
}
