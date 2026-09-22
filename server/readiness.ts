import type { Store } from './db.js';
import type { Readiness } from '../shared/types.js';

export function readiness(store:Store):Readiness {
  const production=process.env.NODE_ENV==='production';
  const loginProtected=(process.env.ADMIN_PASSWORD?.length??0)>=12;
  let databaseHealthy=false;
  try { databaseHealthy=!!store.db.prepare('SELECT 1 AS ok').get(); } catch { /* Report unavailable. */ }
  const schedulerEnabled=process.env.WORKER_ENABLED!=='false';
  const backup=store.get<{id:string;lastSuccess?:string;error?:string}>('maintenance','backup');
  const backupsConfigured=!!process.env.BACKUP_DIR;
  let publicUrl:string|null=null;
  try { const url=new URL(process.env.APP_URL||''); if(url.protocol==='https:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))publicUrl=url.origin; } catch { /* Local or not configured. */ }
  const google=!!process.env.GOOGLE_PLACES_API_KEY;
  return {environment:production?'production':'local',publicUrl,loginProtected,databaseHealthy,schedulerEnabled,backupsConfigured,checks:[
    {id:'workspace',title:'Workspace storage',ready:databaseHealthy,detail:databaseHealthy?'The database is responding. Leads and sales updates are saved here.':'The database needs attention.'},
    {id:'discovery',title:'Automatic business discovery',ready:schedulerEnabled,detail:'Official café and bakery directories can be refreshed without API keys. Coverage and source errors are shown in Data & accuracy.'},
    {id:'drafting',title:'AI message writing',ready:!!process.env.OPENAI_API_KEY,detail:process.env.OPENAI_API_KEY?'OpenAI key is configured. A draft request checks service access.':'Catalogue templates work now. Add OPENAI_API_KEY for AI personalization.'},
    {id:'sending',title:'Reviewed email sending',ready:!!process.env.RESEND_API_KEY&&!!process.env.OUTREACH_FROM&&process.env.OUTREACH_ENABLED==='true',detail:'Requires a Resend key, verified sender and sending enabled. No messages are sent during setup.'},
    {id:'login',title:'Protected sign-in',ready:loginProtected,detail:loginProtected?'An administrator password is configured.':'Set ADMIN_PASSWORD to at least 12 characters before publishing.'},
    {id:'hosting',title:'Production address',ready:production&&!!publicUrl,detail:production&&publicUrl?'The server is running in production with a configured HTTPS address.':'The app is running locally. A production host and HTTPS address are required to publish it.'},
    {id:'scheduler',title:'Scheduled searches',ready:schedulerEnabled,detail:schedulerEnabled?'The background worker is enabled. An always-on host keeps schedules running.':'The worker is disabled. Set WORKER_ENABLED=true to run queued searches and routines.'},
    {id:'backup',title:'Automatic database backups',ready:backupsConfigured&&!backup?.error,detail:backup?.error?backup.error:backupsConfigured?(backup?.lastSuccess?`Latest successful backup: ${backup.lastSuccess}. Keep a separate off-host copy.`:'Daily snapshots are configured. The first successful backup has not been recorded yet.'):'Configure BACKUP_DIR for daily backups on persistent storage.'},
  ]};
}
