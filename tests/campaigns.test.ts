import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID, createHmac } from 'node:crypto';
import { createStore } from '../server/db.js';
import { newLead } from '../server/service.js';
import { createApp } from '../server/app.js';
import { buildAudience, destination, defaultBody, defaultSubject, type AudienceFilters, type Campaign, type Recipient } from '../shared/campaigns.js';
import { campaignAudience, createCampaign, controlCampaign, detail, recoverCampaigns, runCampaignTick, loadWhatsAppTemplate } from '../server/campaigns.js';
import type { Lead, Product } from '../shared/types.js';

const nativeFetch=globalThis.fetch;
const product:Product={id:'sugar',name:'Demerara Sugar',category:'Sugar sachets',image:'',url:'https://www.dhampurgreen.com/products/demerara-brown-sugar-sachets',price:1399,unit:'10 Kg',segments:['Cafés'],pitch:'For beverage service',syncedAt:new Date().toISOString()};
const filters:AudienceFilters={channel:'email',city:'',segment:'',productId:'',limit:100};
function fixture(){
  const store=createStore(':memory:');store.put('products',product);
  const env={OUTREACH_ENABLED:'true',RESEND_API_KEY:'test-only',OUTREACH_FROM:'DG <team@sender.test>',OUTREACH_POSTAL_ADDRESS:'Test company address',APP_URL:'https://private.test',DAILY_EMAIL_LIMIT:'30',DAILY_WHATSAPP_LIMIT:'30',WORKER_ENABLED:'true',WHATSAPP_ENABLED:'true',WHATSAPP_ACCESS_TOKEN:'test-only',WHATSAPP_PHONE_NUMBER_ID:'123456',WHATSAPP_API_VERSION:'v23.0',WHATSAPP_TEMPLATE_ID:'123',WHATSAPP_APP_SECRET:'test-secret',WHATSAPP_VERIFY_TOKEN:'test-verify'};
  const previous=Object.fromEntries(Object.keys(env).map(key=>[key,process.env[key]]));Object.assign(process.env,env);
  let sequence=0;
  const add=(patch:Partial<Lead>={})=>{const n=++sequence;const lead=newLead(store,{name:`Cafe ${n}`,city:'Delhi NCR',segment:'Cafés',email:`buyer${n}@business.test`,phone:`+91980000${String(n).padStart(4,'0')}`,...patch});lead.permissions={email:{status:'granted',address:lead.email.toLowerCase(),note:'Signed product update form; record 123',recordedAt:new Date().toISOString()},whatsapp:{status:'granted',address:lead.phone,note:'Signed WhatsApp updates opt-in form',recordedAt:new Date().toISOString()},...patch.permissions};store.put('leads',lead);return lead;};
  const draft=(f=filters)=>createCampaign(store,{requestId:randomUUID(),name:'Test batch',filters:f,subject:defaultSubject,body:defaultBody,leadIds:campaignAudience(store,f).selected.map(c=>c.leadId)});
  return {store,add,draft,close:()=>{store.db.close();globalThis.fetch=nativeFetch;for(const [key,value] of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}};
}

test('campaign ranking prefers actual buyer interest; contact deduplication never invents enough recipients',()=>{
  const s=fixture();try{const cold=s.add({name:'Complete listing',saved:true,stage:'Qualified'});const warm=s.add({name:'Buyer asked for a sample',contactHistory:[{id:'call',channel:'Call',outcome:'Sample requested',summary:'Requested trial',createdAt:new Date().toISOString(),nextFollowUp:''}]});s.add({email:warm.email});s.add({permissions:{email:undefined}});s.add({stage:'Lost'});s.add({suppressed:true});
    const result=campaignAudience(s.store,filters);assert.equal(result.selected[0].leadId,warm.id);assert.equal(result.selected.length,2);assert.equal(result.duplicates,1);assert.equal(result.requested,100);assert.ok(result.selected.some(c=>c.leadId===cold.id));assert.match(result.selected[0].reasons.join(' '),/sample requested/);assert.equal(new Set(result.selected.map(c=>c.address)).size,2);
    assert.equal(destination({email:'',phone:'9876543210'},'whatsapp'),'+919876543210');assert.equal(destination({email:'person@sample.example',phone:''},'email'),'');
  }finally{s.close();}
});
test('drafts freeze personalisation and audience; sends are claimed once and carry a working unsubscribe token',async()=>{
  const s=fixture();try{s.add();s.add();const draft=s.draft();let calls=0;let payload:any;
    globalThis.fetch=async(_url,init)=>{calls++;payload=JSON.parse(String(init?.body));assert.match(new Headers(init?.headers).get('Idempotency-Key')!,/^grow-campaign-/);return new Response(JSON.stringify({id:'receipt-'+calls}),{status:200});};
    assert.throws(()=>controlCampaign(s.store,draft.campaign.id,'start',false),/Review/);controlCampaign(s.store,draft.campaign.id,'start',true);controlCampaign(s.store,draft.campaign.id,'start',true);
    await Promise.all([runCampaignTick(s.store),runCampaignTick(s.store)]);assert.equal(calls,1);assert.match(payload.text,/Test company address/);assert.match(payload.text,/Unsubscribe: https:\/\/private.test\/api\/unsubscribe\?token=/);
    const token=payload.text.split('token=')[1];assert.ok(s.store.db.prepare('SELECT email FROM unsubscribe_tokens WHERE token=?').get(token));
    await runCampaignTick(s.store);await runCampaignTick(s.store);assert.equal(calls,2);assert.equal(detail(s.store,draft.campaign.id).campaign.status,'completed');assert.equal(detail(s.store,draft.campaign.id).recipients.filter(r=>r.status==='accepted').length,2);assert.equal(campaignAudience(s.store,filters).ready,0);
  }finally{s.close();}
});
test('revoked permission, changed contacts and shared inbox suppression are rechecked at send time',async()=>{
  const s=fixture();try{const a=s.add();const b=s.add();const c=s.add();const draft=s.draft();controlCampaign(s.store,draft.campaign.id,'start',true);
    s.store.put('leads',{...a,permissions:{...a.permissions,email:{...a.permissions!.email!,status:'revoked'}}});s.store.put('leads',{...b,email:'new@business.test'});s.store.db.prepare('INSERT INTO suppressions VALUES(?,?)').run(c.email,new Date().toISOString());
    globalThis.fetch=async()=>{throw new Error('must never call provider');};for(let i=0;i<4;i++)await runCampaignTick(s.store);assert.equal(detail(s.store,draft.campaign.id).recipients.filter(r=>r.status==='skipped').length,3);assert.equal(detail(s.store,draft.campaign.id).campaign.status,'completed');
  }finally{s.close();}
});
test('daily limits defer remaining recipients, while pause and cancel stop pending work',async()=>{
  const s=fixture();try{s.add();s.add();process.env.DAILY_EMAIL_LIMIT='1';let calls=0;globalThis.fetch=async()=>{calls++;return new Response(JSON.stringify({id:'receipt'}));};const draft=s.draft();controlCampaign(s.store,draft.campaign.id,'start',true);await runCampaignTick(s.store);await runCampaignTick(s.store);
    assert.equal(calls,1);const current=detail(s.store,draft.campaign.id).campaign;assert.equal(current.status,'queued');assert.ok(Date.parse(current.nextRunAt!)>Date.now());
    controlCampaign(s.store,draft.campaign.id,'pause');await runCampaignTick(s.store);assert.equal(calls,1);controlCampaign(s.store,draft.campaign.id,'cancel');assert.equal(detail(s.store,draft.campaign.id).recipients.filter(r=>r.status==='skipped').length,1);
  }finally{s.close();}
});
test('uncertain provider results and restarts pause the queue without automatic retries',async()=>{
  const s=fixture();try{s.add();s.add();const draft=s.draft();controlCampaign(s.store,draft.campaign.id,'start',true);let calls=0;globalThis.fetch=async()=>{calls++;throw new Error('timeout');};await runCampaignTick(s.store);await runCampaignTick(s.store);assert.equal(calls,1);assert.equal(detail(s.store,draft.campaign.id).campaign.status,'paused');assert.equal(detail(s.store,draft.campaign.id).recipients.filter(r=>r.status==='uncertain').length,1);
    const pending=detail(s.store,draft.campaign.id).recipients.find(r=>r.status==='pending')!;s.store.put('campaign_recipients',{...pending,status:'sending'});s.store.put('campaigns',{...draft.campaign,status:'running'});recoverCampaigns(s.store);assert.equal(detail(s.store,draft.campaign.id).recipients.filter(r=>r.status==='uncertain').length,2);await runCampaignTick(s.store);assert.equal(calls,1);
  }finally{s.close();}
});
test('a pause during a request remains paused after the provider responds',async()=>{
  const s=fixture();try{s.add();s.add();const draft=s.draft();controlCampaign(s.store,draft.campaign.id,'start',true);let finish!:(response:Response)=>void;globalThis.fetch=()=>new Promise(resolve=>{finish=resolve;});const running=runCampaignTick(s.store);controlCampaign(s.store,draft.campaign.id,'pause');finish(new Response(JSON.stringify({id:'accepted'})));await running;assert.equal(detail(s.store,draft.campaign.id).campaign.status,'paused');assert.equal(detail(s.store,draft.campaign.id).recipients[0].status,'accepted');
  }finally{s.close();}
});
test('approved WhatsApp templates use only supported catalogue variables and provider payloads',async()=>{
  const s=fixture();try{s.add();globalThis.fetch=async()=>new Response(JSON.stringify({name:'dg_products',language:'en',status:'APPROVED',components:[{type:'BODY',text:'Hello {{1}}, would you like a trial of {{2}}? Reply STOP to opt out.'}]}));await loadWhatsAppTemplate(s.store);
    const draft=s.draft({...filters,channel:'whatsapp'});assert.match(draft.recipients[0].body,/Cafe 1/);assert.match(draft.recipients[0].body,/Demerara/);assert.ok(!draft.recipients[0].body.includes('{{'));controlCampaign(s.store,draft.campaign.id,'start',true);
    globalThis.fetch=async(url,init)=>{assert.match(String(url),/graph.facebook.com\/v23.0\/123456\/messages/);const payload=JSON.parse(String(init?.body));assert.equal(payload.type,'template');assert.equal(payload.template.components[0].parameters.length,2);return new Response(JSON.stringify({messages:[{id:'wamid.test'}]}));};await runCampaignTick(s.store);assert.equal(detail(s.store,draft.campaign.id).recipients[0].providerId,'wamid.test');
  }finally{s.close();}
});
test('unsupported or unapproved Meta templates cannot become campaign senders',async()=>{
  const s=fixture();try{for(const item of [{status:'PENDING',components:[{type:'BODY',text:'Reply STOP'}]},{status:'APPROVED',components:[{type:'HEADER',text:'Header'},{type:'BODY',text:'Reply STOP'}]},{status:'APPROVED',components:[{type:'BODY',text:'Hi {{3}}, reply STOP'}]}]){globalThis.fetch=async()=>new Response(JSON.stringify({name:'test',language:'en',...item}));await assert.rejects(loadWhatsAppTemplate(s.store));}assert.equal(s.store.get('campaign_templates','approved'),undefined);
  }finally{s.close();}
});
test('campaign API protects public preview, verifies permission imports atomically and accepts only signed opt-outs',async()=>{
  const s=fixture();const server=createApp(s.store).listen(0,'127.0.0.1');await once(server,'listening');const root=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const post=(path:string,body:unknown,headers:Record<string,string>={})=>nativeFetch(root+path,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'Grow',...headers},body:JSON.stringify(body)});
  try{const lead=s.add({permissions:{email:undefined,whatsapp:undefined}});let response=await post('/campaign-permissions',{rows:[{leadId:lead.id,address:lead.email,channel:'email',status:'granted',note:'Buyer signed form on 25 September',confirmed:true},{leadId:'missing',address:'missing@business.test',channel:'email',status:'granted',note:'Buyer signed form',confirmed:true}]});assert.equal(response.status,400);assert.equal(s.store.get<Lead>('leads',lead.id)?.permissions?.email,undefined);
    response=await post('/campaign-permissions',{rows:[{leadId:lead.id,address:'different@business.test',channel:'email',status:'granted',note:'Buyer signed form on 25 September',confirmed:true}]});assert.equal(response.status,400);
    response=await post('/campaign-permissions',{rows:[{leadId:lead.id,address:lead.email,channel:'email',status:'granted',note:'Buyer signed form on 25 September',confirmed:true}]});assert.equal(response.status,200);assert.equal(campaignAudience(s.store,filters).ready,1);
    const body={entry:[{changes:[{value:{messages:[{from:lead.phone.slice(1),text:{body:'STOP'}}]}}]}]};response=await post('/webhooks/whatsapp',body);assert.equal(response.status,403);assert.equal(s.store.list('channel_suppressions').length,0);
    response=await post('/webhooks/whatsapp',body,{'x-hub-signature-256':'sha256='+createHmac('sha256','test-secret').update(JSON.stringify(body)).digest('hex')});assert.equal(response.status,200);assert.equal(s.store.get<Lead>('leads',lead.id)?.permissions?.whatsapp?.status,'revoked');
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));s.close();}
  const preview=createStore(':memory:');const publicServer=createApp(preview,{readOnly:true}).listen(0,'127.0.0.1');await once(publicServer,'listening');try{const base=`http://127.0.0.1:${(publicServer.address() as {port:number}).port}/api`;for(const path of ['/campaigns','/campaign-permissions','/campaigns/whatsapp-template','/campaigns/any/control']){const response=await nativeFetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'Grow'},body:'{}'});assert.equal(response.status,503);}}finally{publicServer.closeAllConnections();await new Promise<void>(resolve=>publicServer.close(()=>resolve()));preview.db.close();}
});
