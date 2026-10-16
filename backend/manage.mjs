// Passwords are accepted ONLY on stdin, never as arguments or environment values printed to logs.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {passwordHash} from './crypto.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const input=await (async()=>{let s='';for await(const c of process.stdin)s+=c;return JSON.parse(s);})();
try {
  if(process.argv[2]==='setup') {
    if(typeof input.password!=='string'||input.password.length<12||input.password.length>128)throw new Error('Yönetici şifresi 12–128 karakter olmalı.');
    const dir=path.join(root,'private');await fs.mkdir(dir,{recursive:true});
    // Do not replace an existing password silently; password changes live in the admin panel.
    try {await fs.access(path.join(dir,'admin-secret.json'));throw new Error('Yönetici kurulmuş. Şifreyi panelden değiştirin.');}catch(e){if(e.code!=='ENOENT')throw e;}
    await fs.writeFile(path.join(dir,'admin-secret.json'),JSON.stringify({hash:await passwordHash(input.password)}),{mode:0o600,flag:'wx'});
    console.log('Yönetici şifresi kuruldu. Şifre kaynak koda veya günlüğe yazılmadı.');
  } else if(process.argv[2]==='import') {
    const base=String(input.apiBase||'').replace(/\/$/,'');
    if(!/^https:\/\/[a-z0-9.-]+$/.test(base)&&!/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(base))throw new Error('Geçerli kayıt servisi adresi gerekli.');
    const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:input.password})});
    const session=await login.json();if(!login.ok)throw new Error(session.error||'Yönetici girişi başarısız.');
    try {
      const roster=JSON.parse(await fs.readFile(path.join(root,'private/roster.json'),'utf8'));
      let imported=0;
      for(let offset=0;offset<roster.students.length;offset+=2){
        const r=await fetch(base+'/api/admin/import',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({students:roster.students.slice(offset,offset+2)})});
        const data=await r.json();if(!r.ok)throw new Error(data.error||'Aktarım başarısız.');imported+=data.imported;
      }
      console.log(`${imported} aktif öğrenci kayıt servisine aktarıldı.`);
    } finally {await fetch(base+'/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+session.token}});}
  } else throw new Error('Desteklenen işlem: setup veya import.');
} catch(e) {console.error(e.message);process.exitCode=1;}
