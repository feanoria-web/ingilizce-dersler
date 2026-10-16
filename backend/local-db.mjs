import {DatabaseSync} from 'node:sqlite';
export function openDatabase(filename=':memory:') {
  const sqlite=new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
  class Statement {
    constructor(sql,args=[]) {this.sql=sql;this.args=args;}
    bind(...args) {return new Statement(this.sql,args);}
    async first() {return sqlite.prepare(this.sql).get(...this.args)||null;}
    async all() {return {results:sqlite.prepare(this.sql).all(...this.args)};}
    async run() {const r=sqlite.prepare(this.sql).run(...this.args);return {meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
  }
  return {prepare:sql=>new Statement(sql),exec:sql=>sqlite.exec(sql),close:()=>sqlite.close(),
    async batch(statements) {sqlite.exec('BEGIN IMMEDIATE');try {const results=[];for(const s of statements)results.push(await s.run());sqlite.exec('COMMIT');return results;}catch(e){sqlite.exec('ROLLBACK');throw e;}}
  };
}
