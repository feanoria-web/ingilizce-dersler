import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {digest} from '../backend/crypto.mjs';
import {validateTeacherGuide,MAX_GUIDE_BYTES,MAX_GUIDE_CHUNKS,MAX_IMPORT_STATEMENT_BYTES} from '../backend/teacher-guides.mjs';

const privateDirectory=fileURLToPath(new URL('../private/',import.meta.url));
const quote=value=>"'"+String(value).replace(/'/g,"''").replace(/\0/g,"'||char(0)||'")+"'";
const bytes=value=>Buffer.byteLength(value,'utf8');

// D1 limits SQL statements to 100,000 bytes and rows to 2,000,000 bytes.
// Count escaped UTF-8 bytes (including SQL syntax) and stay below 48,000.
// D1's import tool owns transactions: do not add BEGIN/COMMIT statements.
// https://developers.cloudflare.com/d1/platform/limits/
// https://developers.cloudflare.com/d1/best-practices/import-export-data/
function chunkPayload(payload,id) {
  const chunks=[];
  let content='',used=0;
  // Reserve the longest possible chunk index and complete INSERT syntax.
  const overhead=bytes(`INSERT INTO teacher_guide_chunks(lesson_id,chunk_index,content) VALUES(${quote(id)},${MAX_GUIDE_CHUNKS-1},'');`);
  const available=MAX_IMPORT_STATEMENT_BYTES-overhead;
  for(const character of payload) {
    const size=character==="'"?2:bytes(character);
    if(used+size>available) {chunks.push(content);content='';used=0;}
    content+=character;used+=size;
  }
  if(content)chunks.push(content);
  if(chunks.length<1||chunks.length>MAX_GUIDE_CHUNKS)throw new Error('Rehber parça sınırı aşıldı.');
  return chunks;
}

export async function buildTeacherGuideImport(bundle,now=new Date().toISOString()) {
  if(!bundle||bundle.version!==1||!Array.isArray(bundle.lessons)||bundle.lessons.length<1||bundle.lessons.length>1000)throw new Error('Geçersiz özel rehber paketi.');
  const seen=new Set(),guides=[];
  // Validate everything before producing or replacing an import file.
  for(const raw of bundle.lessons) {
    const guide=validateTeacherGuide(raw);
    if(seen.has(guide.id))throw new Error('Yinelenmiş rehber kimliği.');
    seen.add(guide.id);
    const payload=JSON.stringify(guide),payloadBytes=bytes(payload);
    if(payloadBytes>MAX_GUIDE_BYTES)throw new Error('Rehber boyut sınırı aşıldı.');
    guides.push({guide,payload,payloadBytes,chunks:chunkPayload(payload,guide.id),checksum:await digest(payload)});
  }
  const sql=['-- PRIVATE: apply migration 0005_teacher_guides.sql before importing.'];
  let chunkCount=0;
  for(const {guide,payloadBytes,chunks,checksum} of guides) {
    // Mark unavailable before replacement; commit complete metadata last. If an
    // import is interrupted, readers cannot serve an old/new mixture.
    sql.push(`INSERT INTO teacher_guides(lesson_id,title,payload_bytes,chunk_count,payload_sha256,updated_at) VALUES(${quote(guide.id)},${quote(guide.title)},0,0,'',${quote(now)}) ON CONFLICT(lesson_id) DO UPDATE SET title=excluded.title,payload_bytes=0,chunk_count=0,payload_sha256='',updated_at=excluded.updated_at;`);
    sql.push(`DELETE FROM teacher_guide_chunks WHERE lesson_id=${quote(guide.id)};`);
    chunks.forEach((content,index)=>sql.push(`INSERT INTO teacher_guide_chunks(lesson_id,chunk_index,content) VALUES(${quote(guide.id)},${index},${quote(content)});`));
    sql.push(`UPDATE teacher_guides SET payload_bytes=${payloadBytes},chunk_count=${chunks.length},payload_sha256=${quote(checksum)} WHERE lesson_id=${quote(guide.id)};`);
    chunkCount+=chunks.length;
  }
  if(sql.some(statement=>bytes(statement)>MAX_IMPORT_STATEMENT_BYTES))throw new Error('SQL aktarım parçası çok büyük.');
  return {sql:sql.join('\n')+'\n',lessonCount:guides.length,chunkCount};
}

function privatePath(value) {
  const resolved=path.resolve(privateDirectory,value),relative=path.relative(privateDirectory,resolved);
  if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw new Error('Rehber dosyaları private klasöründe olmalı.');
  return resolved;
}
async function main() {
  if(process.argv.length>4)throw new Error('Kullanım: node scripts/prepare-teacher-guides-import.mjs [girdi.json] [çıktı.sql]');
  const input=privatePath(process.argv[2]||'teacher-guides.json'),output=privatePath(process.argv[3]||'teacher-guides-import.sql');
  if(input===output)throw new Error('Girdi ve çıktı ayrı dosyalar olmalı.');
  if((await fs.stat(input)).size>250*1024*1024)throw new Error('Özel rehber paketi çok büyük.');
  let bundle;
  try {bundle=JSON.parse(await fs.readFile(input,'utf8'));}catch {throw new Error('Özel rehber paketi okunamadı.');}
  const result=await buildTeacherGuideImport(bundle);
  await fs.mkdir(path.dirname(output),{recursive:true});
  await fs.writeFile(output,result.sql,{mode:0o600});
  console.log(`Özel rehber aktarımı hazır: ${result.lessonCount} rehber, ${result.chunkCount} parça.`);
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main().catch(()=>{console.error('Özel rehber aktarımı hazırlanamadı. Girdi biçimini, boyutunu ve private klasöründeki dosya yollarını kontrol edin.');process.exitCode=1;});
