export const MAX_EXAM_PAYLOAD_BYTES=48000;
const encoder=new TextEncoder();
const failure=(status,message)=>{throw Object.assign(new Error(message),{status});};
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;
const optionalText=(value,max)=>value===undefined||typeof value==='string'&&value.length<=max;
const textList=(value,count,max)=>Array.isArray(value)&&value.length<=count&&value.every(item=>text(item,max));
const plain=value=>Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
const keys=(value,allowed)=>plain(value)&&Object.keys(value).every(key=>allowed.includes(key));
export const validExamId=id=>typeof id==='string'&&/^[a-z0-9-]{3,80}$/.test(id);

// Shared by the offline importer and the private reader.
export function validateExam(exam) {
  const bad=()=>failure(400,'Geçersiz sınav tanımı.');
  if(!keys(exam,['id','title','date','description','published','showLevel','sections','questions','writingSets'])||!validExamId(exam.id)||!text(exam.title,200)||!/^\d{4}-\d{2}-\d{2}$/.test(exam.date||'')||!optionalText(exam.description,1000)||typeof exam.published!=='boolean'||typeof exam.showLevel!=='boolean')bad();
  if(!Array.isArray(exam.questions)||exam.questions.length<1||exam.questions.length>200)bad();
  exam.questions.forEach((q,index)=>{
    if(!keys(q,['n','topic','prompt','options','answer','explanation','why'])||q.n!==index+1||!text(q.topic,120)||!text(q.prompt,500)||!textList(q.options,6,200)||q.options.length<2||!Number.isInteger(q.answer)||q.answer<0||q.answer>=q.options.length||!text(q.explanation,1500))bad();
    if(!Array.isArray(q.why)||q.why.length!==q.options.length||q.why.some((note,option)=>option===q.answer?note!==null:!text(note,600)))bad();
  });
  if(!Array.isArray(exam.sections)||exam.sections.length<1||exam.sections.length>10)bad();
  let next=1;
  for(const s of exam.sections) {
    if(!keys(s,['level','from','to','points','threshold'])||!text(s.level,20)||s.from!==next||!Number.isInteger(s.to)||s.to<s.from||typeof s.points!=='number'||!(s.points>0&&s.points<=100)||!Number.isInteger(s.threshold)||s.threshold<0||s.threshold>s.to-s.from+1)bad();
    next=s.to+1;
  }
  if(next!==exam.questions.length+1)bad();
  if(!plain(exam.writingSets)||Object.entries(exam.writingSets).some(([key,set])=>!/^[A-Z]$/.test(key)||!keys(set,['title','prompts'])||!text(set.title,120)||!textList(set.prompts,10,400)))bad();
  return exam;
}

export function validateResult(result,exam) {
  const bad=()=>failure(400,'Geçersiz sınav sonucu.');
  if(!keys(result,['paper','nameOnPaper','answers','notes','checks','writing'])||!Number.isInteger(result.paper)||result.paper<1||result.paper>1000||!text(result.nameOnPaper,120))bad();
  if(typeof result.answers!=='string'||!new RegExp(`^[a-f*-]{${exam.questions.length}}$`).test(result.answers)||[...result.answers].some((mark,index)=>/[a-f]/.test(mark)&&mark.charCodeAt(0)-97>=exam.questions[index].options.length))bad();
  if(!textList(result.notes,10,500)||!textList(result.checks,10,500))bad();
  const w=result.writing;
  if(!keys(w,['set','empty','parts','strengths','focus'])||!Object.hasOwn(exam.writingSets,w.set)||w.empty!==undefined&&w.empty!==true||!Array.isArray(w.parts)||w.parts.length>exam.writingSets[w.set].prompts.length||w.empty&&w.parts.length||!optionalText(w.strengths,1000)||!textList(w.focus,10,500))bad();
  for(const part of w.parts) {
    if(!keys(part,['original','corrected','fixes','note'])||typeof part.original!=='string'||part.original.length>4000||!text(part.corrected,4000)||!optionalText(part.note,600)||!Array.isArray(part.fixes)||part.fixes.length>30)bad();
    if(part.fixes.some(fix=>!keys(fix,['from','to','note'])||!text(fix.from,400)||!text(fix.to,400)||!text(fix.note,600)))bad();
  }
  return result;
}

// Same scale as the teacher answer key: section points, half points rounded up.
export function scoreResult(exam,answers) {
  const tally={correct:0,incorrect:0,blank:0,invalid:0};
  const sections=exam.sections.map(s=>{
    let correct=0;
    for(let n=s.from;n<=s.to;n++) {
      const mark=answers[n-1];
      if(mark==='-')tally.blank++;else if(mark==='*')tally.invalid++;else if(mark.charCodeAt(0)-97===exam.questions[n-1].answer){correct++;tally.correct++;}else tally.incorrect++;
    }
    return {level:s.level,correct,count:s.to-s.from+1,points:s.points,earned:correct*s.points,threshold:s.threshold,passed:correct>=s.threshold};
  });
  const total=Math.round(sections.reduce((sum,s)=>sum+s.earned,0));
  const max=Math.round(sections.reduce((sum,s)=>sum+s.count*s.points,0));
  let level='Starter';
  for(const s of sections){if(!s.passed)break;level=s.level;}
  return {total,max,...tally,sections,level};
}

function parse(row,validate) {
  try {return validate(JSON.parse(row));}catch {failure(503,'Sınav sonuçları şu anda kullanılamıyor.');}
}
function present(exam,result,{admin=false}={}) {
  const {published,showLevel,writingSets,...publicExam}=exam;
  const score=scoreResult(exam,result.answers);
  if(!showLevel&&!admin)delete score.level;
  const {checks,...visible}=result;
  return {...publicExam,showLevel,writingSet:writingSets[result.writing.set],result:{...visible,...(admin?{checks}:{}),score}};
}

// Callers authenticate first. Students receive only their own published rows.
export async function studentExamResults(env,studentId) {
  const {results=[]}=await env.DB.prepare('SELECT e.payload_json AS exam,r.payload_json AS result FROM exam_results r JOIN exams e ON e.id=r.exam_id WHERE r.student_id=? AND e.published=1 ORDER BY e.exam_date DESC,e.id').bind(studentId).all();
  return {exams:results.map(row=>{const exam=parse(row.exam,validateExam);return present(exam,parse(row.result,result=>validateResult(result,exam)));})};
}

export async function adminExamResults(env) {
  const [{results:exams=[]},{results:rows=[]}]=await Promise.all([
    env.DB.prepare('SELECT payload_json FROM exams ORDER BY exam_date DESC,id').all(),
    env.DB.prepare('SELECT r.exam_id,r.student_id,r.payload_json,s.name,s.group_name FROM exam_results r JOIN students s ON s.id=r.student_id ORDER BY r.exam_id,s.name').all(),
  ]);
  return {exams:exams.map(row=>{
    const exam=parse(row.payload_json,validateExam);
    const results=rows.filter(r=>r.exam_id===exam.id).map(r=>({studentId:r.student_id,studentName:r.name,group:r.group_name,...present(exam,parse(r.payload_json,result=>validateResult(result,exam)),{admin:true}).result}));
    return {...exam,results};
  })};
}

export const payloadBytes=value=>encoder.encode(value).length;
