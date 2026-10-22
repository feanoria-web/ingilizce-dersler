import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {openDatabase} from './local-db.mjs';
import {handleRequest,importStudents} from './service.mjs';
import {migrateLocal} from './migrate-local.mjs';
import {readPrivateExams,buildExamImport} from '../scripts/prepare-exam-import.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const privateDir=path.join(root,'private');await fs.mkdir(privateDir,{recursive:true});
const db=openDatabase(path.join(privateDir,'activity.sqlite'));
await migrateLocal(db);
let settings={};try {settings=JSON.parse(await fs.readFile(path.join(privateDir,'admin-secret.json'),'utf8'));}catch{}
const env={DB:db,LOCAL:true,ADMIN_PASSWORD_HASH:settings.hash};
if(!settings.hash&&!await db.prepare("SELECT value FROM settings WHERE key='admin_password_hash'").first())console.log('Yönetici kurulumu gerekli: once Kurulum.ps1 dosyasını çalıştırın.');
try {const roster=JSON.parse(await fs.readFile(path.join(privateDir,'roster.json'),'utf8'));await importStudents(env,roster.students);}catch(e){if(e.code!=='ENOENT')throw e;}
const exams=await readPrivateExams();if(exams.length)db.exec(buildExamImport(exams).sql);
const site=path.join(root,'_site');
try {await fs.access(path.join(site,'index.html'));}catch {throw new Error('Önce node scripts/build-access.mjs çalıştırın.');}
const port=Number(process.env.PORT||8787);
const server=http.createServer(async(req,res)=>{
  try {
    const base=`http://127.0.0.1:${port}`,url=new URL(req.url,base);
    if(url.pathname.startsWith('/api/')) {
      const data=[];let size=0;for await(const c of req){size+=c.length;if(size>65536){res.writeHead(413).end();return;}data.push(c);}
      const request=new Request(new URL(url.pathname+url.search,base),{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:Buffer.concat(data)}:{})});
      const response=await handleRequest(request,env);
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    if(url.pathname==='/setup.html'){
      res.writeHead(200,{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'});res.end(await fs.readFile(path.join(root,'setup.html')));return;
    }
    let relative=decodeURIComponent(url.pathname).replace(/^\/ingilizce-dersler\//,'/');if(relative==='/'||relative==='/ingilizce-dersler')relative='/index.html';
    const filename=path.resolve(site,'.'+relative);
    if(!filename.startsWith(site+path.sep)||relative.includes('\\')||relative.includes('\0')){res.writeHead(403).end();return;}
    const data=await fs.readFile(filename),type={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.svg':'image/svg+xml'}[path.extname(filename)]||'application/octet-stream';
    res.writeHead(200,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});res.end(data);
  } catch(e) {res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'text/plain;charset=utf-8'}).end('Dosya bulunamadı veya işlem tamamlanamadı.');}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local: http://127.0.0.1:${port}/`));
for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>server.close(()=>{db.close();process.exit(0);}));
