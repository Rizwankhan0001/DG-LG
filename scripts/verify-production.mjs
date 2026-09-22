import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';

const expectedRecords=JSON.parse(await readFile(new URL('../data/researched-leads.json',import.meta.url),'utf8')).length;
const directory=await mkdtemp(join(tmpdir(),'grow-production-check-'));
const password=randomBytes(24).toString('base64url');
const port='3006';
const base=`http://127.0.0.1:${port}`;
let child;
let output='';
const env={...process.env,NODE_ENV:'production',PORT:port,HOST:'127.0.0.1',APP_URL:'https://localhost',ADMIN_EMAIL:'test@example.org',ADMIN_PASSWORD:password,DATABASE_PATH:join(directory,'grow.db'),BACKUP_DIR:join(directory,'backups'),WORKER_ENABLED:'false',GOOGLE_PLACES_API_KEY:'',OPENAI_API_KEY:'',HUNTER_API_KEY:'',RESEND_API_KEY:'',OUTREACH_ENABLED:'false'};
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function start(){
  output='';
  child=spawn(process.execPath,['--import','tsx','server/index.ts'],{env,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>{output+=chunk;});child.stderr.on('data',chunk=>{output+=chunk;});
  for(let i=0;i<100;i++){
    if(child.exitCode!==null)throw new Error(`Production server stopped early: ${output.replaceAll(password,'[redacted]')}`);
    try{if((await fetch(base+'/api/health')).ok)return;}catch{}
    await pause(100);
  }
  throw new Error('Production server did not become healthy.');
}
async function stop(){
  if(!child||child.exitCode!==null)return;
  const exiting=once(child,'exit');child.kill('SIGTERM');
  const timer=setTimeout(()=>child.kill('SIGKILL'),10000);timer.unref();
  await exiting;clearTimeout(timer);
}
async function login(){
  const response=await fetch(base+'/api/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'Grow',Origin:'https://localhost'},body:JSON.stringify({email:'test@example.org',password})});
  assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);
  return cookie.split(';')[0];
}
try {
  await start();
  assert.equal((await fetch(base+'/api/bootstrap')).status,401);
  const index=await fetch(base);assert.equal(index.status,200);assert.match(await index.text(),/id="root"/);
  assert.ok(index.headers.get('content-security-policy'));
  let cookie=await login();
  const bootstrap=await (await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}})).json();
  assert.equal(bootstrap.mode,'live');assert.equal(bootstrap.leads.length,expectedRecords);
  const lead=bootstrap.leads.find(item=>item.segment==='Cafés');
  const saved=await fetch(base+`/api/leads/${lead.id}`,{method:'PATCH',headers:{Cookie:cookie,'Content-Type':'application/json','X-Requested-With':'Grow',Origin:'https://localhost'},body:JSON.stringify({saved:true})});
  assert.equal(saved.status,200);
  const plan={useCaseId:'sachets',dailyLow:80,dailyHigh:100,days:25,portion:1,supplyShare:50,notes:'Production persistence check'};
  const scenario=await fetch(base+`/api/leads/${lead.id}/demand-plan`,{method:'PUT',headers:{Cookie:cookie,'Content-Type':'application/json','X-Requested-With':'Grow',Origin:'https://localhost'},body:JSON.stringify(plan)});
  assert.equal(scenario.status,200);
  await stop();await start();cookie=await login();
  const restored=await (await fetch(base+'/api/bootstrap',{headers:{Cookie:cookie}})).json();
  assert.equal(restored.leads.find(item=>item.id===lead.id).saved,true);
  assert.equal(restored.leads.length,expectedRecords);
  assert.equal(restored.leads.find(item=>item.id===lead.id).demandPlan.dailyLow,80);
  console.log('Production check passed: compiled frontend, protected API, secure session cookies, real starter records and data persistence after restart.');
} finally {await stop();await rm(directory,{recursive:true,force:true});}
