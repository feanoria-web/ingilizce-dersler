import {normalizeName} from './crypto.mjs';
import {LEARNING_EVENT_KINDS,learningFromRow} from './learning-insights.mjs';
export const CLIENT_TYPES=new Set(['page_view','lesson_open','activity_view','answer_check','answer_reveal','activity_complete','vocabulary_reveal','heartbeat','question_result','audio_play','audio_complete','tab_visible','tab_hidden','window_focus','window_blur','idle_start','abandoned','resumed','page_leave',...Object.keys(LEARNING_EVENT_KINDS)]);
export const INACTIVE_AFTER_SECONDS=330;
export const PRESENCE_WINDOW_SECONDS=75;
export const TAB_WINDOW_SECONDS=1800;
const CONTEXT_STATUSES=new Set(['working','reading','background','unfocused','left_open','leaving']);
const INTERACTIONS=new Set(['pointer','keyboard','scroll','touch','navigation','none']);
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
// Only allow our static pages. Query strings, typed text, fragments and other
// websites never belong in the engagement log.
function pagePath(value) {
  if(typeof value!=='string'||value.length>200)fail(400,'Geçersiz sayfa konumu.');
  const normalized=value.replace(/^\/?ingilizce-dersler\//,'').replace(/^\//,'')||'index.html';
  if(!['panel','index.html'].includes(normalized)&&!validLocation(normalized,''))fail(400,'Geçersiz sayfa konumu.');
  return normalized;
}
export function engagementStatus(context) {
  if(context.status==='leaving')return 'leaving';
  if(context.idleSeconds>=INACTIVE_AFTER_SECONDS)return 'left_open';
  if(context.visibility==='hidden')return 'background';
  if(!context.focused)return 'unfocused';
  return context.idleSeconds>=60?'reading':'working';
}
export function validateContext(value,now=new Date().toISOString(),eventType='') {
  if(value===undefined)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||!/^([a-f0-9]{8}-){1}[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value.tabId||''))fail(400,'Geçersiz sekme kimliği.');
  const result={tabId:value.tabId.toLowerCase(),pagePath:pagePath(value.pagePath)};
  for(const [key,max] of Object.entries({pageTitle:180,screenId:120,screenTitle:180,section:180})) {
    if(typeof value[key]!=='string'||value[key].length>max||/[<>\u0000-\u001f\u007f]/.test(value[key]))fail(400,'Geçersiz sayfa veya bölüm başlığı.');
    result[key]=value[key].trim();
  }
  if(!['visible','hidden'].includes(value.visibility)||typeof value.focused!=='boolean'||!Number.isInteger(value.idleSeconds)||value.idleSeconds<0||value.idleSeconds>86400||!INTERACTIONS.has(value.interaction)||!CONTEXT_STATUSES.has(value.status))fail(400,'Geçersiz sekme etkinliği.');
  if(value.lastInteractionAt!==null&&typeof value.lastInteractionAt!=='string')fail(400,'Geçersiz son hareket zamanı.');
  Object.assign(result,{visibility:value.visibility,focused:value.focused,idleSeconds:value.idleSeconds,lastInteractionAt:value.lastInteractionAt===null?null:clientTime(value.lastInteractionAt,now),interaction:value.interaction,status:eventType==='page_leave'?'leaving':value.status});
  result.status=engagementStatus(result);
  return result;
}
export function validateContextLocation(context,lesson) {
  if(context&&(lesson==='panel'?!['panel','index.html'].includes(context.pagePath):context.pagePath!==lesson))fail(400,'Sayfa ve ders konumu eşleşmiyor.');
  return context;
}
export const CONTEXT_FIELDS='tab_id,page_path,page_title,screen_id,screen_title,section,visibility,focused,idle_seconds,last_interaction_at,interaction,status';
export const contextValues=c=>[c.tabId,c.pagePath,c.pageTitle,c.screenId,c.screenTitle,c.section,c.visibility,c.focused?1:0,c.idleSeconds,c.lastInteractionAt,c.interaction,c.status];
function contextFromRow(row) {
  if(!row.tab_id)return null;
  return {tabId:row.tab_id,pagePath:row.page_path,pageTitle:row.page_title,screenId:row.screen_id,screenTitle:row.screen_title,section:row.section,visibility:row.visibility,focused:!!row.focused,idleSeconds:row.idle_seconds,lastInteractionAt:row.last_interaction_at||null,interaction:row.interaction,status:row.status};
}
export async function onlineStudents(env) {
  const asOf=new Date().toISOString(),cutoff=new Date(Date.parse(asOf)-PRESENCE_WINDOW_SECONDS*1000).toISOString(),tabCutoff=new Date(Date.parse(asOf)-TAB_WINDOW_SECONDS*1000).toISOString();
  const records=await all(env.DB,`SELECT st.id,st.name,st.group_name,p.lesson,p.activity,p.seen_at
    FROM presence p JOIN students st ON st.id=p.student_id JOIN sessions s ON s.token_hash=p.session_hash
    WHERE st.enabled=1 AND p.state='active' AND p.seen_at>=? AND s.expires_at>?
    AND NOT EXISTS (SELECT 1 FROM tab_presence t WHERE t.session_hash=p.session_hash AND t.seen_at>=?)
    ORDER BY p.seen_at DESC`,[cutoff,asOf,tabCutoff]);
  const tabRows=await all(env.DB,`SELECT st.id,st.name,st.group_name,p.* FROM tab_presence p
    JOIN students st ON st.id=p.student_id JOIN sessions s ON s.token_hash=p.session_hash
    WHERE st.enabled=1 AND s.expires_at>? AND p.seen_at>=? AND (p.status!='leaving' OR p.seen_at>=?)
    ORDER BY p.seen_at DESC LIMIT 2000`,[asOf,tabCutoff,cutoff]);
  const tabs=tabRows.map(row=>{
    const context=contextFromRow(row),stale=row.seen_at<cutoff;
    // Between current pings, inactivity still advances. Once the 75-second
    // signal window expires, report unknown instead of guessing an open tab.
    if(!stale) {
      context.idleSeconds=Math.min(86400,context.idleSeconds+Math.max(0,Math.floor((Date.parse(asOf)-Date.parse(row.seen_at))/1000)));
      context.status=engagementStatus(context);
    }
    return {id:row.id,studentId:row.id,name:row.name,group:row.group_name,lesson:row.lesson,activity:row.activity,lastSeen:row.seen_at,...context,status:stale?'unknown':context.status,lastStatus:context.status,stale,context};
  });
  for(const row of tabs)if(!row.stale&&row.status==='working')records.push({id:row.id,name:row.name,group_name:row.group,lesson:row.lesson,activity:row.activity,seen_at:row.lastSeen,context:row.context});
  records.sort((a,b)=>b.seen_at.localeCompare(a.seen_at));
  const seen=new Set(),online=[];
  for(const row of records)if(!seen.has(row.id)){seen.add(row.id);online.push({id:row.id,name:row.name,group:row.group_name,lesson:row.lesson,activity:row.activity,lastSeen:row.seen_at,...(row.context?{context:row.context}:{})});}
  const summary={working:0,reading:0,background:0,unfocused:0,leftOpen:0,stale:0,leaving:0,students:new Set(tabs.map(t=>t.id)).size,tabs:tabs.length};
  for(const tab of tabs)summary[tab.stale?'stale':tab.status==='left_open'?'leftOpen':tab.status]++;
  return {online,tabs,sessions:tabs,summary,asOf,windowSeconds:PRESENCE_WINDOW_SECONDS,tabWindowSeconds:TAB_WINDOW_SECONDS,inactiveAfterSeconds:INACTIVE_AFTER_SECONDS};
}
export const LOG_COLUMNS=`e.id,e.student_id,e.type,e.lesson,e.activity,e.created_at,e.occurred_at,e.active_seconds,
 st.name,st.group_name,r.question_id,r.prompt,r.selected_answer,r.correct_answer,r.outcome,r.assessment_kind,r.attempt,
 c.tab_id,c.page_path,c.page_title,c.screen_id,c.screen_title,c.section,c.visibility,c.focused,c.idle_seconds,c.last_interaction_at,c.interaction,c.status,l.payload_json AS learning_json`;
export const LOG_JOIN='FROM events e JOIN students st ON st.id=e.student_id LEFT JOIN assessment_results r ON r.event_id=e.id LEFT JOIN event_contexts c ON c.event_id=e.id LEFT JOIN event_learning l ON l.event_id=e.id';
export function mapEvent(row) {
  return {id:row.id,studentId:row.student_id,studentName:row.name,group:row.group_name,type:row.type,lesson:row.lesson,activity:row.activity,createdAt:row.created_at,occurredAt:row.occurred_at||null,activeSeconds:row.active_seconds,context:contextFromRow(row),learning:learningFromRow(row),details:row.question_id?{questionId:row.question_id,prompt:row.prompt,selectedAnswer:row.selected_answer,correctAnswer:row.correct_answer,outcome:row.outcome,assessmentKind:row.assessment_kind,attempt:row.attempt}:null};
}
export async function queryLogs(env,url,f,exporting=false) {
  const p=url.searchParams,type=p.get('eventType')||'',outcome=p.get('outcome')||'',student=p.get('student')||'',cursor=p.get('cursor')||'';
  if(type&&!CLIENT_TYPES.has(type)&&!['login','logout','exam_results_view'].includes(type))fail(400,'Geçersiz etkinlik türü.');
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
