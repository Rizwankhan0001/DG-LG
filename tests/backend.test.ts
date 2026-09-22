import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { mkdtemp, readdir, rm, writeFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backupDatabase } from '../server/backups.js';
import { defaultPlan } from '../shared/opportunity.js';
import { businessDate, dateAfter, followUpState } from '../shared/workflow.js';
import { applyHostingDefaults } from '../server/hosting.js';
import { createStore } from '../server/db.js';
import { createApp } from '../server/app.js';
import { newLead, queueDiscovery, runDiscovery } from '../server/service.js';
import { seed } from '../server/seed.js';
import { seedResearch, researchedBusinesses } from '../server/research.js';
import { csvCell, scoreLead } from '../server/scoring.js';
import { makePitch } from '../server/providers.js';
import type { Lead, Product, Job, Draft } from '../shared/types.js';

const products=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')) as Product[];
const nativeFetch=globalThis.fetch;
async function setup(){
  const store=createStore(':memory:');seed(store,products);const server=createApp(store).listen(0,'127.0.0.1');await once(server,'listening');
  const address=server.address() as {port:number};const url=`http://127.0.0.1:${address.port}/api`;
  async function request(path:string,body?:unknown,method?:string,headers:Record<string,string>={}){
    const response=await nativeFetch(url+path,{method:method??(body?'POST':'GET'),headers:{'Content-Type':'application/json','X-Requested-With':'Grow',...headers},...(body?{body:JSON.stringify(body)}:{})});
    const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}return {status:response.status,data,headers:response.headers};
  }
  return {store,request,close:async()=>{server.closeAllConnections();await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));store.db.close();}};
}

test('scoring is explainable and does not invent contact data or purchasing intent',()=>{
  const minimal=scoreLead({segment:'Cafés',city:'Delhi NCR',phone:'',email:'',website:'',rating:null,reviews:0},products,['Delhi NCR']);
  assert.equal(minimal.score,50);assert.ok(minimal.products.length>0);assert.equal(minimal.scoreReasons.length,2);
  const complete=scoreLead({segment:'Cafés',city:'Delhi NCR',phone:'+911234567890',email:'contact@example.com',website:'https://example.com',rating:4.5,reviews:100},products,['Delhi NCR']);
  assert.equal(complete.score,100);assert.ok(complete.scoreReasons.some(r=>r.includes('confirm deliverability')));
});
test('CSV cells escape quotes and prevent spreadsheet formulas',()=>{
  assert.equal(csvCell('=HYPERLINK("x")'),'"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell(' +SUM(A1)'),'"\' +SUM(A1)"');
  assert.equal(csvCell('Hello, World'),'"Hello, World"');
});
test('sample and live workspaces stay isolated; duplicate business listings are skipped',async()=>{
  const s=await setup();try{
    assert.equal((await s.request('/bootstrap?mode=demo')).data.leads.length,45);
    assert.equal((await s.request('/bootstrap?mode=live')).data.leads.length,0);
    const input={name:'Test Kitchen',city:'Delhi NCR',segment:'Restaurants',area:'Test area',mode:'live'};
    const created=await s.request('/leads',input);assert.equal(created.status,201);assert.equal(created.data.value,0);
    assert.equal((await s.request('/leads',input)).status,409);
    assert.equal((await s.request('/bootstrap?mode=demo')).data.leads.length,45);
    assert.equal((await s.request('/bootstrap?mode=live')).data.leads.length,1);
    const second=newLead(s.store,{name:'Renamed Listing',city:'Delhi NCR',segment:'Cafés',sourceId:'place-1'});
    assert.ok(s.store.saveLead(second));assert.equal(s.store.saveLead({...second,id:'another',name:'Same Place Different Name'}),false);
  }finally{await s.close();}
});
test('CRM stage, value, follow-up, notes and shortlist changes persist',async()=>{
  const s=await setup();try{
    const lead=s.store.list<Lead>('leads')[0];
    const update=await s.request(`/leads/${lead.id}`,{stage:'Sample sent',value:12500,saved:true,nextFollowUp:'2026-10-01'},'PATCH');assert.equal(update.status,200);
    assert.equal(update.data.value,12500);assert.equal(update.data.saved,true);assert.match(update.data.valueBasis,/User-entered/);
    await s.request(`/leads/${lead.id}/notes`,{text:'Send a sachet sample pack.'});
    const stored=s.store.get<Lead>('leads',lead.id)!;assert.equal(stored.stage,'Sample sent');assert.equal(stored.notes[0].text,'Send a sachet sample pack.');
    assert.equal((await s.request(`/leads/${lead.id}`,{demo:false},'PATCH')).status,400);
    assert.equal((await s.request(`/leads/${lead.id}`,{value:-1},'PATCH')).status,400);
    assert.equal((await s.request(`/leads/${lead.id}`,{website:'javascript:alert(1)'},'PATCH')).status,400);
  }finally{await s.close();}
});
test('CSV import reports invalid rows, detects duplicates and exports source provenance',async()=>{
  const s=await setup();try{
    const csv='name,city,segment,email\nImport Cafe,Mumbai,Cafés,hello@example.com\nImport Cafe,Mumbai,Cafés,hello@example.com\nBad City,Paris,Cafés,\n';
    const response=await s.request('/leads/import',{csv,mode:'live'});assert.equal(response.status,200);assert.equal(response.data.imported,1);assert.equal(response.data.duplicates,1);assert.equal(response.data.errors[0].row,4);
    const output=await s.request('/leads/export?mode=live');assert.match(output.data,/Import Cafe/);assert.match(output.data,/CSV import/);assert.doesNotMatch(output.data,/Juniper/);
  }finally{await s.close();}
});
test('sample discovery can rerun without generating duplicate leads or sending email',async()=>{
  const s=await setup();try{
    const input={cities:['Delhi NCR','Mumbai'],segments:['Cafés' as const],limit:10,mode:'demo' as const};
    const job=queueDiscovery(s.store,input);await runDiscovery(s.store,job);
    assert.equal(s.store.get<Job>('jobs',job.id)?.status,'completed');assert.equal(job.found,10);
    const second=queueDiscovery(s.store,input);await runDiscovery(s.store,second);assert.equal(second.found,0);assert.equal(second.duplicates,10);
    const lead=s.store.list<Lead>('leads')[0];const draft=await s.request(`/leads/${lead.id}/draft`,{});assert.equal(draft.status,201);assert.equal(draft.data.engine,'template');
    assert.equal((await s.request(`/drafts/${draft.data.id}/send`,{reviewed:true})).status,400);
    assert.equal(s.store.get<Draft>('drafts',draft.data.id)?.status,'draft');
  }finally{await s.close();}
});
test('live discovery uses supported official sources without a paid key and rejects uncovered markets',async()=>{
  const previous=process.env.GOOGLE_PLACES_API_KEY;delete process.env.GOOGLE_PLACES_API_KEY;
  const s=await setup();try{
    const response=await s.request('/discover',{cities:['Mumbai'],segments:['Cafés'],limit:10,mode:'live'});assert.equal(response.status,400);assert.match(response.data.error,/official directory/);
    assert.equal((await s.request('/discover',{cities:['Mumbai'],segments:['Bakeries'],limit:500,mode:'live'})).status,202);
    assert.equal((await s.request('/bootstrap?mode=live')).data.leads.length,0);
  }finally{await s.close();if(previous)process.env.GOOGLE_PLACES_API_KEY=previous;}
});
test('Google checks are live-only, preserve the CRM and enforce daily quotas',async()=>{
  const previous=process.env.GOOGLE_PLACES_API_KEY;const limit=process.env.DAILY_DISCOVERY_LIMIT;process.env.GOOGLE_PLACES_API_KEY='test-only';process.env.DAILY_DISCOVERY_LIMIT='1';const s=await setup();let calls=0;
  globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),'https://places.googleapis.com/v1/places:searchText');assert.match(String(init?.body),/Mumbai/);return new Response(JSON.stringify({places:[{id:'place-123',displayName:{text:'Possible Café'},formattedAddress:'Bandra, Mumbai',businessStatus:'OPERATIONAL'}]}),{status:200,headers:{'Content-Type':'application/json'}});};
  try{
    const lead=newLead(s.store,{name:'Saved Cafe',city:'Mumbai',segment:'Cafés'});s.store.saveLead(lead);
    const response=await s.request(`/leads/${lead.id}/google-check`,{});assert.equal(response.status,200);assert.equal(response.data.places[0].id,'place-123');assert.equal(response.headers.get('cache-control'),'no-store');
    assert.deepEqual(s.store.get<Lead>('leads',lead.id),lead);assert.equal(s.store.list<Lead>('leads').filter(l=>!l.demo).length,1);
    assert.equal((await s.request(`/leads/${lead.id}/google-check`,{})).status,400);assert.equal(calls,1);
  }finally{globalThis.fetch=nativeFetch;await s.close();if(previous)process.env.GOOGLE_PLACES_API_KEY=previous;else delete process.env.GOOGLE_PLACES_API_KEY;if(limit)process.env.DAILY_DISCOVERY_LIMIT=limit;else delete process.env.DAILY_DISCOVERY_LIMIT;}
});
test('request origin protection and database-backed sign-in protect the workspace',async()=>{
  const previous=process.env.ADMIN_PASSWORD;process.env.ADMIN_PASSWORD='test-password-123456';const s=await setup();
  try{
    assert.equal((await s.request('/bootstrap')).status,401);
    const blocked=await s.request('/auth/login',{email:'admin@dhampurgreen.com',password:'test-password-123456'},undefined,{Origin:'https://untrusted.example'});assert.equal(blocked.status,403);
    const wrong=await s.request('/auth/login',{email:'admin@dhampurgreen.com',password:'wrong'});assert.equal(wrong.status,401);
    const login=await s.request('/auth/login',{email:'admin@dhampurgreen.com',password:'test-password-123456'});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie')!.split(';')[0];assert.match(login.headers.get('set-cookie')!,/HttpOnly/);
    assert.equal((await s.request('/bootstrap?mode=demo',undefined,undefined,{Cookie:cookie})).status,200);
    await s.request('/auth/logout',{},undefined,{Cookie:cookie});assert.equal((await s.request('/bootstrap',undefined,undefined,{Cookie:cookie})).status,401);
  }finally{await s.close();if(previous)process.env.ADMIN_PASSWORD=previous;else delete process.env.ADMIN_PASSWORD;}
});

test('AI requests use supplied catalogue facts and discard unknown product identifiers',async()=>{
  const previous=process.env.OPENAI_API_KEY;process.env.OPENAI_API_KEY='test-only';const s=await setup();
  let sent:Record<string,any>={};
  globalThis.fetch=async(input,init)=>{assert.equal(String(input),'https://api.openai.com/v1/responses');sent=JSON.parse(String(init?.body));return new Response(JSON.stringify({output:[{type:'message',content:[{type:'output_text',text:JSON.stringify({summary:'Category match; confirm requirements.',productIds:[products[0].id,'invented-id'],subject:'A sample conversation',body:'Hello, would you like to discuss a sample?'} )}]}]}),{status:200});};
  try{
    const lead=newLead(s.store,{name:'Live Cafe',city:'Mumbai',segment:'Cafés'});const result=await makePitch(lead,products,s.store.settings());
    assert.equal(result.engine,'openai');assert.equal(sent.store,false);assert.equal(sent.text.format.type,'json_schema');assert.ok(!result.productIds.includes('invented-id'));assert.ok(!sent.input.includes('notes'));
  }finally{globalThis.fetch=nativeFetch;await s.close();if(previous)process.env.OPENAI_API_KEY=previous;else delete process.env.OPENAI_API_KEY;}
});

test('reviewed sending is idempotent and unsubscribe blocks future outreach',async()=>{
  const names=['RESEND_API_KEY','OUTREACH_ENABLED','OUTREACH_FROM'];const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{RESEND_API_KEY:'test-only',OUTREACH_ENABLED:'true',OUTREACH_FROM:'Dhampur Green <sender@example.com>'});const s=await setup();let calls=0;let payload:any;
  globalThis.fetch=async(input,init)=>{calls++;assert.equal(String(input),'https://api.resend.com/emails');payload=JSON.parse(String(init?.body));assert.match(String((init?.headers as Record<string,string>)['Idempotency-Key']),/^grow-draft-/);return new Response(JSON.stringify({id:'test-provider-id'}),{status:200});};
  try{
    const lead=newLead(s.store,{name:'Email Test Cafe',city:'Mumbai',segment:'Cafés',email:'buyer@example.com'});s.store.saveLead(lead);
    const draft=(await s.request(`/leads/${lead.id}/draft`,{})).data;
    assert.equal((await s.request(`/drafts/${draft.id}/send`,{reviewed:false})).status,400);assert.equal(calls,0);
    const sent=await s.request(`/drafts/${draft.id}/send`,{reviewed:true});assert.equal(sent.status,200);assert.equal(sent.data.status,'sent');assert.equal(calls,1);
    assert.equal((await s.request(`/drafts/${draft.id}/send`,{reviewed:true})).status,200);assert.equal(calls,1);
    assert.equal((await s.request(`/drafts/${draft.id}`,{subject:'Edited',body:'Changed'},'PATCH')).status,400);
    const token=payload.text.match(/token=([a-f0-9]{64})/)[1];assert.ok(token);
    const unsubscribe=await s.request('/unsubscribe',{token});assert.equal(unsubscribe.status,200);assert.equal(s.store.get<Lead>('leads',lead.id)?.suppressed,true);
    assert.equal((await s.request(`/leads/${lead.id}/draft`,{})).status,400);assert.equal(calls,1);
  }finally{globalThis.fetch=nativeFetch;await s.close();for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});

test('uncertain send retries preserve exactly the same payload and key',async()=>{
  const names=['RESEND_API_KEY','OUTREACH_ENABLED','OUTREACH_FROM'];const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{RESEND_API_KEY:'test-only',OUTREACH_ENABLED:'true',OUTREACH_FROM:'Dhampur Green <sender@example.com>'});const s=await setup();const payloads:string[]=[];const keys:string[]=[];
  globalThis.fetch=async(_input,init)=>{payloads.push(String(init?.body));keys.push((init?.headers as Record<string,string>)['Idempotency-Key']);if(payloads.length===1)throw new Error('Simulated lost provider response');return new Response(JSON.stringify({id:'same-provider-id'}),{status:200});};
  try{
    const lead=newLead(s.store,{name:'Retry Test Cafe',city:'Mumbai',segment:'Cafés',email:'buyer@example.com'});s.store.saveLead(lead);
    const draft=(await s.request(`/leads/${lead.id}/draft`,{})).data;
    assert.equal((await s.request(`/drafts/${draft.id}/send`,{reviewed:true})).status,400);
    assert.equal(s.store.get<Draft>('drafts',draft.id)?.status,'failed');
    assert.equal((await s.request(`/drafts/${draft.id}/send`,{reviewed:true})).status,200);
    assert.equal(payloads[0],payloads[1]);assert.equal(keys[0],keys[1]);
  }finally{globalThis.fetch=nativeFetch;await s.close();for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});

test('scheduled discovery enriches new businesses before qualifying outreach drafts',async()=>{
  const names=['GOOGLE_PLACES_API_KEY','HUNTER_API_KEY'];const previous=Object.fromEntries(names.map(k=>[k,process.env[k]]));
  Object.assign(process.env,{GOOGLE_PLACES_API_KEY:'test-only',HUNTER_API_KEY:'test-only'});const s=await setup();let hunterCalls=0;
  globalThis.fetch=async(input)=>{
    if(String(input).startsWith('https://theobroma.in/'))return new Response('<div class="outlet"><h3>Theobroma Bakery Store in Test Market</h3><p>Shop 14, Test Market, Bengaluru 560001</p></div>',{headers:{'Content-Type':'text/html'}});
    assert.ok(String(input).startsWith('https://api.hunter.io/v2/domain-search?'));hunterCalls++;return new Response(JSON.stringify({data:{emails:[{value:'contact@example.com',confidence:90,sources:[{uri:'https://company.example.com/contact'}]}]}}),{status:200});
  };
  try{
    const rule={id:'email-routine',name:'Email routine',cities:['Bengaluru'],segments:['Bakeries' as const],frequency:'daily' as const,enabled:false,mode:'live' as const,minScore:70,enrichEmails:true,draftOutreach:true,lastRun:null,nextRun:new Date().toISOString(),createdAt:new Date().toISOString()};s.store.put('automations',rule);
    const job=queueDiscovery(s.store,{cities:rule.cities,segments:rule.segments,limit:5,mode:'live',automationId:rule.id});await runDiscovery(s.store,job);
    assert.equal(job.status,'completed');assert.equal(job.found,1);assert.equal(hunterCalls,1);
    const lead=s.store.list<Lead>('leads').find(l=>l.directoryId==='theobroma-bangalore')!;assert.equal(lead.email,'contact@example.com');assert.equal(lead.emailSource,'https://company.example.com/contact');assert.equal(s.store.list<Draft>('drafts').filter(d=>!d.demo).length,1);
    const again=queueDiscovery(s.store,{cities:rule.cities,segments:rule.segments,limit:5,mode:'live',automationId:rule.id});await runDiscovery(s.store,again);assert.equal(again.duplicates,1);assert.equal(hunterCalls,1);
  }finally{globalThis.fetch=nativeFetch;await s.close();for(const name of names){if(previous[name]===undefined)delete process.env[name];else process.env[name]=previous[name];}}
});

test('researched businesses retain evidence and user edits across restarts, with no invented commercial data',async()=>{
  const s=await setup();try{
    assert.equal(seedResearch(s.store),researchedBusinesses.length);
    const live=(await s.request('/bootstrap')).data;
    assert.equal(live.mode,'live');assert.equal(live.leads.length,researchedBusinesses.length);
    for(const city of ['Delhi NCR','Mumbai','Bengaluru'])assert.equal(live.leads.filter((l:Lead)=>l.city===city).length,researchedBusinesses.filter(l=>l.city===city).length);
    for(const lead of live.leads as Lead[]){
      assert.equal(lead.demo,false);assert.equal(lead.value,0);assert.equal(lead.rating,null);assert.equal(lead.reviews,0);
      assert.equal(lead.stage,'New');assert.equal(lead.saved,false);assert.ok(lead.contactContext);
      assert.ok(lead.evidence?.length);assert.ok(lead.evidence?.every(item=>item.value===lead[item.field]&&item.url.startsWith('https://')), 'Each fact must match the record and carry its own source URL.');
    }
    const original=researchedBusinesses.find(l=>l.email)!;
    const updated=await s.request(`/leads/${original.id}`,{email:'purchasing@example.org',stage:'Qualified',saved:true},'PATCH');
    assert.equal(updated.status,200);assert.equal(updated.data.emailSource,'User provided');
    assert.ok(!updated.data.evidence.some((item:{field:string})=>item.field==='email'));
    assert.ok(updated.data.evidence.some((item:{field:string})=>item.field==='phone'));
    assert.match(updated.data.contactContext,/edited/);
    assert.equal(seedResearch(s.store),0);
    const saved=s.store.get<Lead>('leads',original.id)!;
    assert.equal(saved.email,'purchasing@example.org');assert.equal(saved.stage,'Qualified');assert.equal(saved.saved,true);
    const unchanged=await s.request(`/leads/${original.id}`,{email:saved.email,phone:saved.phone},'PATCH');
    assert.deepEqual(unchanged.data.evidence,saved.evidence);
    assert.equal((await s.request('/bootstrap?mode=demo')).data.leads.length,45);
  }finally{await s.close();}
});

test('daily action dates use India time and exclude closed and suppressed leads',()=>{
  assert.equal(businessDate(new Date('2026-09-20T20:00:00Z')),'2026-09-21');
  assert.equal(dateAfter(1,new Date('2026-12-31T12:00:00Z')),'2027-01-01');
  const store=createStore(':memory:');
  try {
    const lead=newLead(store,{name:'Test Cafe',city:'Mumbai',segment:'Cafés',nextFollowUp:'2026-09-20'});
    assert.equal(followUpState(lead,'2026-09-20'),'today');
    assert.equal(followUpState(lead,'2026-09-21'),'overdue');
    assert.equal(followUpState(lead,'2026-09-19'),'upcoming');
    assert.equal(followUpState({...lead,stage:'Won'},'2026-09-21'),'none');
    assert.equal(followUpState({...lead,suppressed:true},'2026-09-21'),'none');
  } finally {store.db.close();}
});
test('contact updates persist history and change follow-ups only after validation',async()=>{
  const s=await setup();try{
    const lead=s.store.list<Lead>('leads')[0];
    const input={channel:'Call',outcome:'Interested',summary:'Manager requested sugar sachet options.',stage:'Contacted',nextFollowUp:dateAfter(3)};
    const first=await s.request(`/leads/${lead.id}/contact-log`,input);
    assert.equal(first.status,201);assert.equal(first.data.contactHistory.length,1);
    assert.equal(first.data.stage,'Contacted');assert.equal(first.data.nextFollowUp,dateAfter(3));
    assert.equal((await s.request(`/leads/${lead.id}/contact-log`,{...input,nextFollowUp:'2000-01-01'})).status,400);
    assert.equal((await s.request(`/leads/${lead.id}/contact-log`,{...input,stage:'Won'})).status,400);
    const second=await s.request(`/leads/${lead.id}/contact-log`,{...input,outcome:'Sample requested',nextFollowUp:'',stage:'Sample sent'});
    assert.equal(second.status,201);assert.equal(second.data.contactHistory.length,2);assert.equal(second.data.nextFollowUp,'');
    assert.equal(second.data.contactHistory[0].summary,input.summary);
    assert.equal(s.store.list<Draft>('drafts').filter(d=>d.status==='sent').length,0);
    await s.request(`/leads/${lead.id}`,{suppressed:true},'PATCH');
    assert.equal((await s.request(`/leads/${lead.id}/contact-log`,input)).status,400);
    const status=await s.request('/readiness');assert.equal(status.status,200);assert.equal(status.data.databaseHealthy,true);
    assert.ok(status.data.checks.some((item:{id:string})=>item.id==='backup'));
    assert.ok(!Object.keys(status.data).includes('ADMIN_PASSWORD'));
  }finally{await s.close();}
});
test('database backups restore actual records and retention never removes unrelated files',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'grow-backup-test-'));const store=createStore(':memory:');
  try {
    store.put('test',{id:'one',message:'Persist this record'});
    await writeFile(join(directory,'unrelated.txt'),'keep');
    await writeFile(join(directory,'grow-backup-2000-01-01T00-00-00-000Z.sqlite'),'old backup');
    const path=await backupDatabase(store,directory,1);
    const restored=createStore(path);
    try{assert.equal(restored.get<{id:string;message:string}>('test','one')?.message,'Persist this record');}finally{restored.db.close();}
    assert.ok((await readdir(directory)).includes('unrelated.txt'));
    assert.ok(!(await readdir(directory)).includes('grow-backup-2000-01-01T00-00-00-000Z.sqlite'));
    assert.equal((await stat(path)).mode&0o777,0o600);
  }finally{store.db.close();await rm(directory,{recursive:true,force:true});}
});
test('hosting defaults preserve explicit settings and use a mounted persistent volume',()=>{
  const env:NodeJS.ProcessEnv={RAILWAY_PUBLIC_DOMAIN:'example.up.railway.app',RAILWAY_VOLUME_MOUNT_PATH:'/app/storage',RAILWAY_ENVIRONMENT_ID:'test'};
  applyHostingDefaults(env);assert.equal(env.APP_URL,'https://example.up.railway.app');assert.equal(env.DATABASE_PATH,'/app/storage/grow.db');assert.equal(env.BACKUP_DIR,'/app/storage/backups');assert.equal(env.HOST,'0.0.0.0');
  const explicit:NodeJS.ProcessEnv={...env,APP_URL:'https://grow.example.org',DATABASE_PATH:'/custom/data.db'};applyHostingDefaults(explicit);assert.equal(explicit.APP_URL,'https://grow.example.org');assert.equal(explicit.DATABASE_PATH,'/custom/data.db');
});

test('saved demand scenarios persist and invalid updates cannot corrupt a lead',async()=>{
  const s=await setup();try{
    const lead=newLead(s.store,{name:'Scenario Café',city:'Mumbai',segment:'Cafés'});s.store.saveLead(lead);
    const path=`/leads/${lead.id}/demand-plan`;const plan={...defaultPlan('Cafés'),dailyLow:80,dailyHigh:100,notes:'Discuss sweetener preferences with purchasing.'};
    const initial=await s.request(`/leads/${lead.id}/opportunity`);assert.equal(initial.data.confirmedDemand,false);
    const saved=await s.request(path,plan,'PUT');assert.equal(saved.status,200);assert.equal(saved.data.demandPlan.dailyLow,80);assert.equal(saved.data.value,0);
    const restored=await s.request(`/leads/${lead.id}/opportunity`);assert.equal(restored.data.estimate.low,2400);assert.equal(restored.data.confirmedDemand,false);assert.equal(restored.data.basis,'Saved planning assumptions');
    for(const invalid of [{...plan,dailyHigh:10},{...plan,dailyLow:-1},{...plan,days:32},{...plan,days:1.5},{...plan,portion:0},{...plan,supplyShare:101},{...plan,useCaseId:'baking'},{...plan,confirmedDemand:true}])assert.equal((await s.request(path,invalid,'PUT')).status,400);
    assert.equal(s.store.get<Lead>('leads',lead.id)?.demandPlan?.dailyLow,80);
    assert.equal((await s.request('/leads/missing/demand-plan',plan,'PUT')).status,404);
  }finally{await s.close();}
});
