import fs from 'node:fs';
import path from 'node:path';
import {DatabaseSync} from 'node:sqlite';
export const dataRoot=()=>process.env.PROOFDOCK_DATA_DIR||path.join(process.cwd(),process.cwd().endsWith('/web')?'../data':'data');
export const config=()=>JSON.parse(fs.readFileSync(path.join(dataRoot(),'deployment.json'),'utf8'));
export function openStore(){fs.mkdirSync(dataRoot(),{recursive:true});const db=new DatabaseSync(path.join(dataRoot(),'proofdock.sqlite'));db.exec('PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; CREATE TABLE IF NOT EXISTS records(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS executions(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS quotes(id TEXT PRIMARY KEY,payload TEXT NOT NULL); CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,payload TEXT NOT NULL);');return db;}
const tables=new Set(['records','executions','quotes','reports']);
export function read(table,id){if(!tables.has(table))throw Error('invalid table');const db=openStore();try{const row=db.prepare(`SELECT payload FROM ${table} WHERE id=?`).get(id);return row?JSON.parse(row.payload):null;}finally{db.close();}}
export function write(table,id,value){if(!tables.has(table))throw Error('invalid table');const db=openStore();try{db.prepare(`INSERT INTO ${table}(id,payload) VALUES(?,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload`).run(id,JSON.stringify(value));}finally{db.close();}}
export function all(table){if(!tables.has(table))throw Error('invalid table');const db=openStore();try{return db.prepare(`SELECT payload FROM ${table}`).all().map(r=>JSON.parse(r.payload));}finally{db.close();}}
export function claimQuote(id){const db=openStore();try{return Number(db.prepare("UPDATE quotes SET payload=json_set(payload,'$.state','submitted') WHERE id=? AND json_extract(payload,'$.state')='quoted'").run(id).changes)===1;}finally{db.close();}}
export function trustedOrigin(req){const origin=req.headers.get('origin');if(origin&&(new URL(origin).host!==(req.headers.get('host')||new URL(req.url).host)||new URL(origin).protocol!==new URL(req.url).protocol))throw Error('拒绝跨站请求');}
