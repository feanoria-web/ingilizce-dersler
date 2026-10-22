import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {validateExam,validateResult,validExamId,payloadBytes,MAX_EXAM_PAYLOAD_BYTES} from '../backend/exam-results.mjs';

const privateDirectory=fileURLToPath(new URL('../private/',import.meta.url));
const quote=value=>"'"+String(value).replace(/'/g,"''").replace(/\0/g,"'||char(0)||'")+"'";

// D1 limits SQL statements to 100,000 bytes; each payload stays below 48,000.
// D1's import tool owns transactions: do not add BEGIN/COMMIT statements.
// https://developers.cloudflare.com/d1/platform/limits/
export function buildExamImport(bundles,{studentIds,now=new Date().toISOString()}={}) {
  if(!Array.isArray(bundles)||bundles.length<1||bundles.length>100)throw new Error('Geçersiz sınav paketi.');
  const sql=['-- PRIVATE: apply migration 0006_exam_results.sql before importing.'],skipped=[],seen=new Set();
  let resultCount=0;
  // Validate everything before producing or replacing an import file.
  const prepared=bundles.map(({exam:raw,results})=>{
    const exam=validateExam(raw);
    if(seen.has(exam.id))throw new Error(`Yinelenmiş sınav kimliği: ${exam.id}`);
    seen.add(exam.id);
    if(!results||results.examId!==exam.id||!Array.isArray(results.students))throw new Error(`${exam.id}: sonuç dosyası bu sınava ait değil.`);
    const students=new Set(),papers=new Set(),rows=[];
    for(const entry of results.students) {
      const {studentId,...result}=entry;
      validateResult(result,exam);
      if(papers.has(result.paper))throw new Error(`${exam.id}: ${result.paper} numaralı kağıt iki kez var.`);
      papers.add(result.paper);
      if(studentId===null){skipped.push(`${exam.id} · kağıt ${result.paper} (${result.nameOnPaper})`);continue;}
      if(typeof studentId!=='string'||!/^[a-z0-9-]{2,64}$/.test(studentId)||students.has(studentId))throw new Error(`${exam.id}: kağıt ${result.paper} öğrenci kimliği geçersiz veya yinelenmiş.`);
      if(studentIds&&!studentIds.has(studentId))throw new Error(`${exam.id}: ${studentId} öğrenci listesinde yok.`);
      students.add(studentId);
      rows.push({studentId,payload:JSON.stringify(result)});
    }
    const payload=JSON.stringify(exam);
    for(const value of [payload,...rows.map(row=>row.payload)])if(payloadBytes(value)>MAX_EXAM_PAYLOAD_BYTES)throw new Error(`${exam.id}: bir kayıt D1 sınırını aşıyor.`);
    return {exam,payload,rows};
  });
  for(const {exam,payload,rows} of prepared) {
    sql.push(`INSERT INTO exams(id,title,exam_date,published,payload_json,updated_at) VALUES(${quote(exam.id)},${quote(exam.title)},${quote(exam.date)},${exam.published?1:0},${quote(payload)},${quote(now)}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,exam_date=excluded.exam_date,published=excluded.published,payload_json=excluded.payload_json,updated_at=excluded.updated_at;`);
    sql.push(`DELETE FROM exam_results WHERE exam_id=${quote(exam.id)};`);
    for(const row of rows)sql.push(`INSERT INTO exam_results(exam_id,student_id,payload_json,updated_at) VALUES(${quote(exam.id)},${quote(row.studentId)},${quote(row.payload)},${quote(now)});`);
    resultCount+=rows.length;
  }
  if(sql.some(statement=>Buffer.byteLength(statement,'utf8')>90000))throw new Error('SQL aktarım satırı çok büyük.');
  return {sql:sql.join('\n')+'\n',examCount:prepared.length,resultCount,skipped};
}

// private/exams/<sınav-kimliği>/exam.json + results.json
export async function readPrivateExams(directory=path.join(privateDirectory,'exams')) {
  let entries;
  try {entries=await fs.readdir(directory,{withFileTypes:true});}catch(error){if(error.code==='ENOENT')return [];throw error;}
  const bundles=[];
  for(const entry of entries.filter(item=>item.isDirectory()&&validExamId(item.name)).sort((a,b)=>a.name.localeCompare(b.name))) {
    const read=async name=>JSON.parse(await fs.readFile(path.join(directory,entry.name,name),'utf8'));
    bundles.push({exam:await read('exam.json'),results:await read('results.json')});
  }
  return bundles;
}

export async function rosterIds(file=path.join(privateDirectory,'roster.json')) {
  const roster=JSON.parse(await fs.readFile(file,'utf8'));
  return new Set((Array.isArray(roster)?roster:roster.students).map(student=>student.id));
}

async function main() {
  if(process.argv.length>2)throw new Error('Kullanım: node scripts/prepare-exam-import.mjs');
  const bundles=await readPrivateExams();
  if(!bundles.length)throw new Error('private/exams altında sınav bulunamadı.');
  const result=buildExamImport(bundles,{studentIds:await rosterIds()});
  const output=path.join(privateDirectory,'exam-results-import.sql');
  await fs.writeFile(output,result.sql,{mode:0o600});
  console.log(`Sınav aktarımı hazır: ${result.examCount} sınav, ${result.resultCount} öğrenci sonucu → private/exam-results-import.sql`);
  for(const item of result.skipped)console.log(`Atlandı (öğrenci listesinde yok): ${item}`);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(error=>{console.error(`Sınav aktarımı hazırlanamadı: ${error.message}`);process.exitCode=1;});
