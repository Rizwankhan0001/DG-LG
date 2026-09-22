import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Activity, Lead, Settings } from '../shared/types.js';

export function createStore(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.exec(`CREATE TABLE IF NOT EXISTS entities (collection TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY(collection,id));
    CREATE TABLE IF NOT EXISTS lead_keys (fingerprint TEXT PRIMARY KEY, lead_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS suppressions (email TEXT PRIMARY KEY, created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS unsubscribe_tokens (token TEXT PRIMARY KEY, email TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS usage (day TEXT NOT NULL, kind TEXT NOT NULL, count INTEGER NOT NULL, PRIMARY KEY(day,kind));`);
  const list = <T>(collection: string): T[] => (db.prepare('SELECT data FROM entities WHERE collection=?').all(collection) as {data:string}[]).map(x => JSON.parse(x.data));
  const get = <T>(collection: string, id: string): T | undefined => { const row = db.prepare('SELECT data FROM entities WHERE collection=? AND id=?').get(collection,id) as {data:string} | undefined; return row ? JSON.parse(row.data) : undefined; };
  const put = <T extends {id:string}>(collection: string, item: T): T => { db.prepare('INSERT INTO entities(collection,id,data) VALUES(?,?,?) ON CONFLICT(collection,id) DO UPDATE SET data=excluded.data').run(collection,item.id,JSON.stringify(item)); return item; };
  const remove = (collection:string,id:string) => db.prepare('DELETE FROM entities WHERE collection=? AND id=?').run(collection,id);
  const activity = (text:string, demo:boolean, kind='lead') => put<Activity>('activities',{id:randomUUID(),text,demo,kind,createdAt:new Date().toISOString()});
  const settings = ():Settings => {
    const item = get<Settings & {id:string}>('settings','business');
    return item ?? {company:'Dhampur Green',senderName:'Dhampur Green Team',targetCities:['Delhi NCR','Mumbai','Bengaluru'],monthlyTarget:500000,defaultDealValue:15000,signature:'Dhampur Green | From our farms to your kitchen\nwww.dhampurgreen.com'};
  };
  const saveLead = db.transaction((lead:Lead):boolean => {
    const normalize = (s:string) => s.toLowerCase().replace(/[^a-z0-9]/g,'');
    const scope = lead.demo ? 'demo' : 'live';
    const keys = [`${scope}:name:${normalize(lead.name)}:${normalize(lead.city)}:${normalize(lead.area)}`];
    if(lead.sourceId) keys.push(`${scope}:source:${lead.sourceId}`);
    if(keys.some(key=>db.prepare('SELECT lead_id FROM lead_keys WHERE fingerprint=?').get(key))) return false;
    for(const key of keys) db.prepare('INSERT INTO lead_keys VALUES(?,?)').run(key,lead.id);
    put('leads',lead); return true;
  });
  const reserveUsage = db.transaction((kind:string,limit:number,amount=1):boolean => {
    const day = new Date().toISOString().slice(0,10);
    const row=db.prepare('SELECT count FROM usage WHERE day=? AND kind=?').get(day,kind) as {count:number}|undefined;
    if((row?.count ?? 0)+amount>limit)return false;
    db.prepare('INSERT INTO usage VALUES(?,?,?) ON CONFLICT(day,kind) DO UPDATE SET count=count+excluded.count').run(day,kind,amount); return true;
  });
  return {db,list,get,put,remove,activity,settings,saveLead,reserveUsage};
}
export type Store = ReturnType<typeof createStore>;
