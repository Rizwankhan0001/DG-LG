import { mkdir, chmod, readdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Store } from './db.js';

export async function backupDatabase(store:Store, directory:string, retain=7):Promise<string> {
  await mkdir(directory,{recursive:true,mode:0o700});
  const stamp=new Date().toISOString().replace(/[:.]/g,'-');
  const path=join(directory,`grow-backup-${stamp}.sqlite`);
  const temporary=path+'.partial';
  try {
    await store.db.backup(temporary);
    await chmod(temporary,0o600);
    await rename(temporary,path);
    const files=(await readdir(directory)).filter(name=>/^grow-backup-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sqlite$/.test(name)).sort().reverse();
    for(const file of files.slice(Math.max(1,Math.min(90,retain))))await rm(join(directory,file));
    return path;
  } catch(error) {
    await rm(temporary,{force:true});
    throw error;
  }
}

export function startBackups(store:Store) {
  const directory=process.env.BACKUP_DIR;
  if(!directory)return ()=>{};
  let busy=false;
  let pending:Promise<void>|undefined;
  const tick=async()=>{
    if(busy)return;
    busy=true;
    try {
      await mkdir(directory,{recursive:true,mode:0o700});
      const latest=(await readdir(directory)).filter(name=>/^grow-backup-\d{4}-\d{2}-\d{2}T[\d-]+Z\.sqlite$/.test(name)).sort().at(-1);
      if(latest&&Date.now()-(await stat(join(directory,latest))).mtimeMs<86400000)return;
      await backupDatabase(store,directory,Number(process.env.BACKUP_RETENTION)||7);
      store.put('maintenance',{id:'backup',lastSuccess:new Date().toISOString(),error:''});
    } catch(error) {
      store.put('maintenance',{id:'backup',error:'The database backup failed. Check the backup directory permissions and available disk space.'});
      console.error('Database backup failed:',error instanceof Error?error.message:'Unknown error');
    } finally {busy=false;}
  };
  const launch=()=>{if(!busy)pending=tick();};
  launch();
  const timer=setInterval(launch,3600000);
  timer.unref();
  return async()=>{clearInterval(timer);await pending;};
}
