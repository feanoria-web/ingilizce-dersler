// Internal pipe helper: stdout is consumed directly by `wrangler secret put`, never printed or saved.
import {openDatabase} from './local-db.mjs';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs/promises';
const location=new URL('../private/',import.meta.url);
let hash='';
try {const db=openDatabase(fileURLToPath(new URL('activity.sqlite',location)));hash=(await db.prepare("SELECT value FROM settings WHERE key='admin_password_hash'").first())?.value||'';db.close();}catch{}
if(!hash)try{hash=JSON.parse(await fs.readFile(new URL('admin-secret.json',location),'utf8')).hash;}catch{}
if(!hash)throw new Error('Önce yerel yönetici şifresini oluşturun.');
process.stdout.write(hash+'\n');
