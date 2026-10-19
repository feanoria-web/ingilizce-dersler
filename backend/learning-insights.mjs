import {normalizeName} from './crypto.mjs';
const fail=(status,message)=>{throw Object.assign(new Error(message),{status});};
const all=async(db,sql,args=[])=>(await db.prepare(sql).bind(...args).all()).results||[];
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const PAGE_KINDS=['lesson','break','resource','overview'];
export const LEARNING_EVENT_KINDS={question_open:'question',question_result:'question',help_used:'help',page_summary:'page',lesson_progress:'progress',break_start:'break',break_pause:'break',break_resume:'break',break_end:'break',dictionary_lookup:'dictionary'};
export function validateLearning(value,type,details=null) {
  if(value===undefined)return null;
  if(!value||typeof value!=='object'||Array.isArray(value)||LEARNING_EVENT_KINDS[type]!==value.kind)fail(400,'Geçersiz öğrenme kaydı türü.');
  const out={kind:value.kind};
  const text=(key,max,nullable=false)=>{const v=value[key];if(nullable&&v===null){out[key]=null;return;}if(typeof v!=='string'||v.length>max||/[<>\u0000-\u001f\u007f]/.test(v))fail(400,'Geçersiz öğrenme kaydı metni.');out[key]=v.trim();};
  const integer=(key,min,max,nullable=false)=>{const v=value[key];if(nullable&&v===null){out[key]=null;return;}if(!Number.isInteger(v)||v<min||v>max)fail(400,'Geçersiz öğrenme süresi veya sayısı.');out[key]=v;};
  const choice=(key,options,nullable=false)=>{if(nullable&&value[key]===null){out[key]=null;return;}if(!options.includes(value[key]))fail(400,'Geçersiz öğrenme kaydı seçeneği.');out[key]=value[key];};
  const bool=(key,nullable=false)=>{if(nullable&&value[key]===null){out[key]=null;return;}if(typeof value[key]!=='boolean')fail(400,'Geçersiz öğrenme kaydı durumu.');out[key]=value[key];};
  const id=key=>{if(!uuid.test(value[key]||''))fail(400,'Geçersiz öğrenme kaydı kimliği.');out[key]=value[key].toLowerCase();};
  if(value.kind==='question') {
    text('questionId',160);text('topicId',120);text('topicTitle',180);
    if(!out.questionId||details&&out.questionId!==details.questionId)fail(400,'Soru kimlikleri eşleşmiyor.');
    if(value.prompt!==undefined&&(typeof value.prompt!=='string'||value.prompt.length>1500||/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value.prompt)))fail(400,'Geçersiz soru metni.');
    out.prompt=value.prompt?.trim()||'';
    integer('wallSeconds',0,86400,true);integer('activeSeconds',0,86400,true);choice('timingScope',['question','screen','unavailable']);
    if(out.activeSeconds!==null&&(out.wallSeconds===null||out.activeSeconds>out.wallSeconds)||out.timingScope==='unavailable'&&(out.wallSeconds!==null||out.activeSeconds!==null))fail(400,'Soru süreleri tutarsız.');
    bool('helpUsed',true);bool('hintUsed',true);bool('answerRevealed',true);
  } else if(value.kind==='help') {
    choice('helpType',['translation','hint','answer','audio']);text('questionId',160,true);bool('attemptedBeforeHelp',true);text('topicId',120);text('topicTitle',180);
    if(out.questionId==='')fail(400,'Geçersiz soru kimliği.');
  } else if(value.kind==='page'||value.kind==='progress') {
    choice('pageKind',PAGE_KINDS);integer('pageIndex',-1,2000);integer('totalPages',0,2000);
    if(out.totalPages&&out.pageIndex>=out.totalPages)fail(400,'Sayfa sırası toplamı aşıyor.');
    if(value.kind==='page') {id('visitId');integer('viewSeconds',0,3600);integer('activeSeconds',0,3600);if(out.activeSeconds>out.viewSeconds)fail(400,'Sayfa süreleri tutarsız.');}
    else {integer('questionCount',0,2000,true);integer('answeredQuestionCount',0,2000);bool('completed');if(out.questionCount!==null&&out.answeredQuestionCount>out.questionCount)fail(400,'Yanıt sayısı soru sayısını aşıyor.');}
  } else if(value.kind==='break') {
    id('breakId');choice('durationMinutes',[10,15]);choice('intervalSeconds',[10,15,20,30]);integer('selectedCount',0,2000);integer('elapsedSeconds',0,900);integer('pausedSeconds',0,86400);choice('endReason',['elapsed','early','closed','navigation'],true);
    if(out.elapsedSeconds>out.durationMinutes*60)fail(400,'Mola süresi tutarsız.');
    if(!Array.isArray(value.selectedPages)||value.selectedPages.length>500||value.selectedPages.length>out.selectedCount)fail(400,'Geçersiz mola sayfaları.');
    out.selectedPages=value.selectedPages.map(p=>{if(!p||typeof p!=='object'||typeof p.id!=='string'||!p.id.trim()||p.id.length>160||typeof p.title!=='string'||p.title.length>180||/[<>\u0000-\u001f\u007f]/.test(p.id+p.title))fail(400,'Geçersiz mola sayfası.');return {id:p.id.trim(),title:p.title.trim()};});
    if(new Set(out.selectedPages.map(p=>p.id)).size!==out.selectedPages.length)fail(400,'Yinelenmiş mola sayfası.');
    if(type==='break_end'&&!out.endReason||type!=='break_end'&&out.endReason!==null)fail(400,'Mola bitiş bilgisi tutarsız.');
  } else {
    text('term',80);if(!out.term)fail(400,'Geçersiz sözlük sözcüğü.');
    out.term=out.term.toLocaleLowerCase('en-US');choice('mode',['selection','manual']);choice('outcome',['found','not_found','error']);choice('source',['local','online','context','none']);
  }
  return out;
}
export function learningFromRow(row) {
  if(!row.learning_json)return null;
  try {return JSON.parse(row.learning_json);}catch{return null;}
}
const identity=s=>({studentId:s.id,studentName:s.name,group:s.group});
const stamp=e=>e.occurredAt||e.createdAt;
const aid=a=>a===null?null:!!(a.helpUsed||a.hintUsed||a.answerRevealed);
function attempt(e) {
  const l=e.learning?.kind==='question'?e.learning:null;
  const assistanceKnown=!!l&&[l.helpUsed,l.hintUsed,l.answerRevealed].every(x=>typeof x==='boolean');
  return {outcome:e.details.outcome,attempt:e.details.attempt,occurredAt:stamp(e),wallSeconds:l?.wallSeconds??null,activeSeconds:l?.activeSeconds??null,timingScope:l?.timingScope||'unavailable',helpUsed:l?.helpUsed??null,hintUsed:l?.hintUsed??null,answerRevealed:l?.answerRevealed??null,assisted:assistanceKnown?aid(l):null};
}
export function aggregateLearning(events,students,firstEvents=[],{truncated=false,limit=40000}={}) {
  const metadata=new Map(students.map(s=>[s.id,s])),questions=new Map(),pages=new Map(),errors=new Map(),breaks=new Map(),dictionary=new Map(),help=new Map(),progress=new Map();
  const firsts=new Map(firstEvents.map(e=>[`${e.studentId}|${e.lesson}|${e.details.questionId}`,e]));
  const summary={studentCount:students.length,questionCount:0,attemptCount:0,firstAttemptCorrect:0,firstAttemptGraded:0,eventualCorrect:0,independentCorrect:0,assistedCorrect:0,unknownAssistanceCorrect:0,improvedCount:0,activeSeconds:0,viewSeconds:0,pageCount:0,completedPageCount:0,dictionaryCount:0,helpCount:0,breakCount:0};
  const base=e=>identity(metadata.get(e.studentId)||{id:e.studentId,name:e.studentName,group:e.group});
  const pageKey=e=>`${e.studentId}|${e.lesson}|${e.context?.screenId||e.activity||'page'}`;
  const getPage=e=>{const key=pageKey(e);let p=pages.get(key);if(!p){p={...base(e),lesson:e.lesson,screenId:e.context?.screenId||e.activity||'',screenTitle:e.context?.screenTitle||'',pageKind:null,pageIndex:null,totalPages:null,visitCount:null,viewSeconds:null,activeSeconds:null,completed:null,firstSeen:stamp(e),lastSeen:stamp(e),visits:new Set()};pages.set(key,p);}if(stamp(e)<p.firstSeen)p.firstSeen=stamp(e);if(stamp(e)>p.lastSeen)p.lastSeen=stamp(e);return p;};
  // Server IDs represent ingestion ordering. Attempt numbers remain the durable
  // authority even when an older offline result arrives after a newer packet.
  for(const e of [...events].sort((a,b)=>a.id-b.id)) {
    const l=e.learning;
    if(e.type==='heartbeat')summary.activeSeconds+=e.activeSeconds||0;
    if(e.lesson!=='panel'&&(e.type==='activity_view'||e.type==='page_view'||l?.kind==='page'||l?.kind==='progress'))getPage(e);
    if(e.type==='question_open'||e.details) {
      const questionId=e.details?.questionId||l?.questionId;
      if(questionId){const key=`${e.studentId}|${e.lesson}|${questionId}`,first=firsts.get(key);let q=questions.get(key);if(!q){q={...base(e),lesson:e.lesson,questionId,prompt:e.details?.prompt||l?.prompt||first?.details?.prompt||questionId,topicId:l?.topicId||'',topicTitle:l?.topicTitle||e.context?.screenTitle||'Konu bilgisi yok',openedCount:0,attemptCount:0,firstAttempt:first?attempt(first):null,latestAttempt:null,improved:false,independentCorrect:false,assistedCorrect:false};questions.set(key,q);}if(e.type==='question_open')q.openedCount++;if(e.details)q.prompt=e.details.prompt;else if(l?.prompt&&q.attemptCount===0)q.prompt=l.prompt;}
    }
    if(e.details) {
      const key=`${e.studentId}|${e.lesson}|${e.details.questionId}`,q=questions.get(key);
      q.attemptCount++;summary.attemptCount++;if(l?.topicId){q.topicId=l.topicId;q.topicTitle=l.topicTitle;}
      if(!q.latestAttempt||e.details.attempt>q.latestAttempt.attempt)q.latestAttempt=attempt(e);
      const first=firsts.get(key)||(e.details.attempt===1?e:null);if(first)q.firstAttempt=attempt(first);
      const current=attempt(e);if(current.outcome==='correct'){if(current.assisted===false)q.independentCorrect=true;if(current.assisted===true)q.assistedCorrect=true;}
      if(e.details.outcome==='incorrect') {
        const topicId=l?.topicId||`screen:${e.context?.screenId||e.activity||'unknown'}`,ek=`${e.studentId}|${e.lesson}|${topicId}`;
        let er=errors.get(ek);if(!er){er={...base(e),lesson:e.lesson,topicId,topicTitle:l?.topicTitle||e.context?.screenTitle||'Konu bilgisi yok',wrongCount:0,questions:new Map()};errors.set(ek,er);}
        er.wrongCount++;const qr=er.questions.get(e.details.questionId)||{questionId:e.details.questionId,prompt:e.details.prompt,count:0};qr.count++;er.questions.set(qr.questionId,qr);
      }
    }
    if(l?.kind==='page') {const p=getPage(e);p.pageKind=l.pageKind;p.pageIndex=l.pageIndex;p.totalPages=l.totalPages;p.viewSeconds=(p.viewSeconds??0)+l.viewSeconds;p.activeSeconds=(p.activeSeconds??0)+l.activeSeconds;p.visits.add(l.visitId);}
    if(l?.kind==='progress') {
      const p=getPage(e);p.pageKind=l.pageKind;p.pageIndex=l.pageIndex;p.totalPages=l.totalPages;p.completed=p.completed||l.completed;
      const key=`${e.studentId}|${e.lesson}`,old=progress.get(key);if(!old||stamp(e)>=old.lastSeen)progress.set(key,{...base(e),lesson:e.lesson,pageKind:l.pageKind,lastPageIndex:l.pageIndex,lastScreenId:e.context?.screenId||e.activity||'',lastScreenTitle:e.context?.screenTitle||'',totalPages:l.totalPages,questionCount:l.questionCount,answeredQuestionCount:l.answeredQuestionCount,currentPageCompleted:l.completed,completed:null,lastSeen:stamp(e)});
    }
    if(l?.kind==='break') {
      const key=`${e.studentId}|${l.breakId}`;let b=breaks.get(key);if(!b){b={...base(e),lesson:e.lesson,breakId:l.breakId,startedAt:null,endedAt:null,durationMinutes:l.durationMinutes,intervalSeconds:l.intervalSeconds,selectedPages:l.selectedPages,selectedCount:l.selectedCount,elapsedSeconds:0,pausedSeconds:0,status:'unknown',endReason:null,pauses:0,transitions:[],lastSeen:''};breaks.set(key,b);}
      b.transitions.push({type:e.type,occurredAt:stamp(e)});if(e.type==='break_start'&&(!b.startedAt||stamp(e)<b.startedAt))b.startedAt=stamp(e);if(e.type==='break_pause')b.pauses++;
      if(stamp(e)>=b.lastSeen){Object.assign(b,{durationMinutes:l.durationMinutes,intervalSeconds:l.intervalSeconds,selectedPages:l.selectedPages,selectedCount:l.selectedCount,elapsedSeconds:l.elapsedSeconds,pausedSeconds:l.pausedSeconds,status:e.type==='break_end'?'ended':e.type==='break_pause'?'paused':'running',endReason:l.endReason,lastSeen:stamp(e)});if(e.type==='break_end')b.endedAt=stamp(e);}
    }
    if(l?.kind==='dictionary') {
      summary.dictionaryCount++;const key=`${e.studentId}|${l.term}`;let d=dictionary.get(key);if(!d){d={...base(e),term:l.term,count:0,days:new Set(),outcomes:{found:0,not_found:0,error:0},sources:{},modes:{},lessons:new Set(),lastSeen:stamp(e)};dictionary.set(key,d);}
      d.count++;d.days.add(new Date(stamp(e)).toLocaleDateString('en-CA',{timeZone:'Europe/Istanbul'}));d.outcomes[l.outcome]++;d.sources[l.source]=(d.sources[l.source]||0)+1;d.modes[l.mode]=(d.modes[l.mode]||0)+1;d.lessons.add(e.lesson);if(stamp(e)>d.lastSeen)d.lastSeen=stamp(e);
    }
    if(l?.kind==='help') {
      summary.helpCount++;const key=`${e.studentId}|${e.lesson}|${l.helpType}|${l.questionId||''}|${l.topicId}`;let h=help.get(key);if(!h){h={...base(e),lesson:e.lesson,helpType:l.helpType,questionId:l.questionId,topicId:l.topicId,topicTitle:l.topicTitle,count:0,beforeAttempt:0,afterAttempt:0,unknownAttempt:0,lastSeen:stamp(e)};help.set(key,h);}
      h.count++;h[l.attemptedBeforeHelp===null?'unknownAttempt':l.attemptedBeforeHelp?'afterAttempt':'beforeAttempt']++;if(stamp(e)>h.lastSeen)h.lastSeen=stamp(e);
    }
  }
  for(const q of questions.values()) {
    summary.questionCount++;if(q.firstAttempt&&['correct','incorrect','blank'].includes(q.firstAttempt.outcome)){summary.firstAttemptGraded++;if(q.firstAttempt.outcome==='correct')summary.firstAttemptCorrect++;}
    if(q.latestAttempt?.outcome==='correct'){summary.eventualCorrect++;if(q.latestAttempt.assisted===null)summary.unknownAssistanceCorrect++;}
    if(q.independentCorrect)summary.independentCorrect++;if(q.assistedCorrect)summary.assistedCorrect++;
    q.improved=!!q.firstAttempt&&['incorrect','blank'].includes(q.firstAttempt.outcome)&&q.latestAttempt?.outcome==='correct';if(q.improved)summary.improvedCount++;
  }
  const pageList=[...pages.values()].map(p=>{p.visitCount=p.visits.size||null;delete p.visits;summary.viewSeconds+=p.viewSeconds||0;if(p.completed)summary.completedPageCount++;return p;});summary.pageCount=pageList.length;summary.breakCount=breaks.size;
  for(const p of pageList){const key=`${p.studentId}|${p.lesson}`,old=progress.get(key);if(!old||p.lastSeen>old.lastSeen)progress.set(key,{studentId:p.studentId,studentName:p.studentName,group:p.group,lesson:p.lesson,pageKind:p.pageKind,lastPageIndex:p.pageIndex,lastScreenId:p.screenId,lastScreenTitle:p.screenTitle,totalPages:p.totalPages,questionCount:null,answeredQuestionCount:null,currentPageCompleted:p.completed,completed:null,lastSeen:p.lastSeen});}
  for(const p of progress.values()) {
    const matching=pageList.filter(x=>x.studentId===p.studentId&&x.lesson===p.lesson),lessonPages=matching.filter(x=>x.pageKind==='lesson'&&Number.isInteger(x.pageIndex)&&x.pageIndex>=0);
    const indices=new Set(lessonPages.map(x=>x.pageIndex)),completedIndices=new Set(lessonPages.filter(x=>x.completed===true).map(x=>x.pageIndex));
    const answeredScreens=new Set(events.filter(e=>e.studentId===p.studentId&&e.lesson===p.lesson&&['correct','incorrect'].includes(e.details?.outcome)).map(e=>e.context?.screenId||e.activity||'').filter(Boolean));
    const answeredIndices=new Set(lessonPages.filter(x=>answeredScreens.has(x.screenId)).map(x=>x.pageIndex));
    p.viewedPages=indices.size||null;
    p.completedPages=lessonPages.some(x=>x.completed!==null)?completedIndices.size:null;
    p.answeredPages=indices.size?answeredIndices.size:null;
    p.activeSeconds=lessonPages.some(x=>x.activeSeconds!==null)?lessonPages.reduce((s,x)=>s+(x.activeSeconds||0),0):null;
    const totals=matching.map(x=>x.totalPages).filter(n=>Number.isInteger(n)&&n>0);if(totals.length)p.totalPages=Math.max(...totals);
    p.completed=p.totalPages>0&&indices.size?completedIndices.size>=p.totalPages:null;
  }
  const timelineEvents=events.filter(e=>!['heartbeat','page_summary'].includes(e.type)),timeline=timelineEvents.sort((a,b)=>stamp(b).localeCompare(stamp(a))||b.id-a.id).slice(0,300);
  return {summary,students,questions:[...questions.values()],repeatedErrors:[...errors.values()].filter(x=>x.wrongCount>=2).map(x=>({...x,questionCount:x.questions.size,questions:[...x.questions.values()]})).sort((a,b)=>b.wrongCount-a.wrongCount),pages:pageList,timeline,breaks:[...breaks.values()],dictionary:[...dictionary.values()].map(d=>({...d,days:[...d.days].sort(),repeatDays:d.days.size,lessons:[...d.lessons]})).sort((a,b)=>b.count-a.count),help:[...help.values()],progress:[...progress.values()],limits:{events:limit,timeline:300},truncated:{events:truncated,timeline:timelineEvents.length>300},asOf:new Date().toISOString()};
}
export async function queryLearning(env,url,f,{columns,join,mapEvent}) {
  const student=url.searchParams.get('student')||'';if(student&&!/^[a-z0-9-]{2,64}$/.test(student))fail(400,'Geçersiz öğrenci filtresi.');
  let students=(await all(env.DB,'SELECT id,name,group_name,first_login FROM students')).map(s=>({id:s.id,name:s.name,group:s.group_name,everVisited:!!s.first_login}));
  students=students.filter(s=>(!student||s.id===student)&&(!f.group||s.group===f.group)&&(!f.q||normalizeName(s.name).includes(f.q))&&(f.visit!=='never'||!s.everVisited)&&(f.visit!=='visited'||s.everVisited));
  const ids=JSON.stringify(students.map(s=>s.id)),limit=40000;
  const records=await all(env.DB,`SELECT ${columns} ${join} WHERE e.student_id IN (SELECT value FROM json_each(?)) AND e.created_at>=? AND e.created_at<? ORDER BY e.id DESC LIMIT ?`,[ids,f.start,f.end,limit+1]);
  const firsts=await all(env.DB,`SELECT ${columns} ${join} WHERE e.student_id IN (SELECT value FROM json_each(?)) AND r.attempt=1 ORDER BY e.id DESC LIMIT ?`,[ids,limit+1]);
  const result=aggregateLearning(records.slice(0,limit).map(mapEvent),students,firsts.slice(0,limit).map(mapEvent),{truncated:records.length>limit,limit});
  result.limits.firstAttempts=limit;result.truncated.firstAttempts=firsts.length>limit;
  return {...result,filters:{from:f.from,to:f.to,group:f.group,student,receiptTime:true}};
}
