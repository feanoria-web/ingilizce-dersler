import fs from 'node:fs/promises';
import {aliasesFor,digest} from '../backend/crypto.mjs';
const root=new URL('../',import.meta.url);
const roster=JSON.parse(await fs.readFile(new URL('private/roster.json',root),'utf8'));
const q=s=>"'"+String(s).replace(/'/g,"''")+"'";
const now=new Date().toISOString(),sql=[];
for(const s of roster.students){
  sql.push(`INSERT INTO students(id,name,group_name,enabled,hide_name,created_at) VALUES(${q(s.id)},${q(s.name)},${q(s.group)},${s.enabled===false?0:1},${s.hideName?1:0},${q(now)}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,group_name=excluded.group_name,hide_name=excluded.hide_name;`);
  sql.push(`DELETE FROM student_aliases WHERE student_id=${q(s.id)};`);
  for(const a of aliasesFor(s))sql.push(`INSERT INTO student_aliases(alias,student_id) VALUES(${q(await digest(a))},${q(s.id)});`);
}
await fs.writeFile(new URL('private/seed.sql',root),sql.join('\n'));
console.log(`Özel aktarım hazır: ${roster.students.length} öğrenci; telefon veya kimlik alanı yok.`);
