import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {openDatabase} from './local-db.mjs';
let configured=false;
try{const x=JSON.parse(await fs.readFile(new URL('../private/admin-secret.json',import.meta.url),'utf8'));configured=!!x.hash;}catch{}
if(!configured)try{const filename=fileURLToPath(new URL('../private/activity.sqlite',import.meta.url));await fs.access(filename);const db=openDatabase(filename);configured=!!(await db.prepare("SELECT value FROM settings WHERE key='admin_password_hash'").first())?.value;db.close();}catch{}
process.exitCode=configured?0:1;
