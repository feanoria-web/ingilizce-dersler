import {digest} from './crypto.mjs';

export const MAX_GUIDE_BYTES=15*1024*1024;
export const MAX_GUIDE_CHUNKS=2048;
export const MAX_IMPORT_STATEMENT_BYTES=48000;
const encoder=new TextEncoder();
const failure=(status,message)=>{throw Object.assign(new Error(message),{status});};
export const validTeacherGuideId=id=>typeof id==='string'&&id.length<=100&&/^(a1|a2|b1|yds)\/[a-z0-9-]+$/.test(id);
const text=(value,max)=>typeof value==='string'&&value.trim().length>0&&value.length<=max;

// Shared by the offline importer and private reader. Section content remains
// arbitrary JSON so existing lesson notes are retained without interpretation.
export function validateTeacherGuide(guide) {
  if(!guide||typeof guide!=='object'||Array.isArray(guide)||!validTeacherGuideId(guide.id)||!text(guide.title,500)||!Array.isArray(guide.sections)||guide.sections.length>1000)failure(400,'Geçersiz öğretmen rehberi.');
  if(Object.keys(guide).some(key=>!['id','title','sections','attachments'].includes(key)))failure(400,'Geçersiz öğretmen rehberi alanı.');
  const ids=new Set();
  for(const section of guide.sections) {
    if(!section||typeof section!=='object'||Array.isArray(section)||!text(section.id,150)||ids.has(section.id)||!text(section.title,500)||!Object.hasOwn(section,'content'))failure(400,'Geçersiz rehber bölümü.');
    ids.add(section.id);
  }
  if(guide.attachments!==undefined) {
    if(!Array.isArray(guide.attachments)||guide.attachments.length>100)failure(400,'Geçersiz rehber eki.');
    for(const attachment of guide.attachments) {
      if(!attachment||typeof attachment!=='object'||Array.isArray(attachment)||!text(attachment.name,255)||typeof attachment.mime!=='string'||attachment.mime.length>150||!/^[a-zA-Z0-9!#$&^_.+-]+\/[a-zA-Z0-9!#$&^_.+-]+$/.test(attachment.mime)||typeof attachment.base64!=='string'||attachment.base64.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(attachment.base64))failure(400,'Geçersiz rehber eki.');
    }
  }
  return guide;
}

// These functions must only be called after service.authenticate(...,true).
// No payload is bundled with the Worker, exposed by a public route or cached.
export async function listTeacherGuides(env) {
  const {results=[]}=await env.DB.prepare('SELECT lesson_id,title FROM teacher_guides WHERE payload_bytes>0 AND chunk_count>0 ORDER BY lesson_id').all();
  if(results.length>1000||results.some(row=>!validTeacherGuideId(row.lesson_id)||!text(row.title,500)))failure(503,'Öğretmen rehberleri şu anda kullanılamıyor.');
  return {lessons:results.map(row=>({id:row.lesson_id,title:row.title}))};
}

export async function readTeacherGuide(env,id) {
  if(!validTeacherGuideId(id))failure(404,'Öğretmen rehberi bulunamadı.');
  // Check aggregate byte/count bounds before fetching any private chunks. A
  // checksum also rejects partial imports or a concurrent replacement.
  const metadata=await env.DB.prepare(`SELECT g.title,g.payload_bytes,g.chunk_count,g.payload_sha256,
    COUNT(c.chunk_index) AS stored_chunks,COALESCE(SUM(length(CAST(c.content AS BLOB))),0) AS stored_bytes,
    MIN(c.chunk_index) AS first_chunk,MAX(c.chunk_index) AS last_chunk
    FROM teacher_guides g LEFT JOIN teacher_guide_chunks c ON c.lesson_id=g.lesson_id
    WHERE g.lesson_id=? GROUP BY g.lesson_id`).bind(id).first();
  if(!metadata)failure(404,'Öğretmen rehberi bulunamadı.');
  const unavailable=()=>failure(503,'Öğretmen rehberi şu anda kullanılamıyor.');
  const {payload_bytes:bytes,chunk_count:count}=metadata;
  if(!Number.isInteger(bytes)||bytes<1||bytes>MAX_GUIDE_BYTES||!Number.isInteger(count)||count<1||count>MAX_GUIDE_CHUNKS||count!==metadata.stored_chunks||bytes!==metadata.stored_bytes||metadata.first_chunk!==0||metadata.last_chunk!==count-1||!/^[a-f0-9]{64}$/.test(metadata.payload_sha256))unavailable();
  const {results=[]}=await env.DB.prepare('SELECT chunk_index,content FROM teacher_guide_chunks WHERE lesson_id=? ORDER BY chunk_index LIMIT ?').bind(id,MAX_GUIDE_CHUNKS+1).all();
  if(results.length!==count||results.some((chunk,index)=>chunk.chunk_index!==index||typeof chunk.content!=='string'))unavailable();
  const payload=results.map(chunk=>chunk.content).join('');
  if(encoder.encode(payload).length!==bytes||await digest(payload)!==metadata.payload_sha256)unavailable();
  let guide;
  try {guide=validateTeacherGuide(JSON.parse(payload));}catch {unavailable();}
  if(guide.id!==id||guide.title!==metadata.title)unavailable();
  return guide;
}
