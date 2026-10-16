import fs from 'node:fs/promises';
export async function migrateLocal(db) {
  const dir=new URL('./migrations/',import.meta.url);
  db.exec('CREATE TABLE IF NOT EXISTS local_migrations(name TEXT PRIMARY KEY)');
  const old=await db.prepare("SELECT name FROM sqlite_master WHERE name='students'").first();
  if(old)await db.prepare("INSERT OR IGNORE INTO local_migrations(name) VALUES('0001_access.sql')").run();
  for(const name of (await fs.readdir(dir)).filter(x=>x.endsWith('.sql')).sort()){
    if(await db.prepare('SELECT name FROM local_migrations WHERE name=?').bind(name).first())continue;
    const sql=await fs.readFile(new URL(name,dir),'utf8');
    try{db.exec('BEGIN IMMEDIATE;'+sql);await db.prepare('INSERT INTO local_migrations(name) VALUES(?)').bind(name).run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}
  }
}
