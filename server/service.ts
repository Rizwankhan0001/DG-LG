import { randomUUID } from 'node:crypto';
import type { Store } from './db.js';
import { scoreLead } from './scoring.js';
import { enrichEmail, makePitch } from './providers.js';
import { discoverOfficial } from './source-discovery.js';
import { directorySources } from './directories.js';
import type { Automation, Draft, Job, Lead, Mode, Product, Segment } from '../shared/types.js';

export function newLead(store:Store, input:Partial<Lead> & Pick<Lead,'name'|'city'|'segment'>):Lead {
  const now=new Date().toISOString();
  const lead:Lead={id:randomUUID(),area:'',stage:'New',score:0,scoreReasons:[],products:[],email:'',phone:'',website:'',source:'Manual entry',sourceUrl:'',sourceId:'',sourceAt:now,rating:null,reviews:0,value:0,valueBasis:'Not estimated. Enter an opportunity value after speaking with the buyer.',owner:'You',notes:[],tags:[],saved:false,demo:false,createdAt:now,updatedAt:now,nextFollowUp:'',suppressed:false,emailSource:'',aiSummary:'',aiGenerated:false,...input};
  Object.assign(lead,scoreLead(lead,store.list<Product>('products'),store.settings().targetCities));
  return lead;
}
export async function createDraft(store:Store,lead:Lead):Promise<Draft> {
  if(lead.suppressed)throw new Error('This lead is marked do not contact.');
  if(process.env.OPENAI_API_KEY&&!lead.demo&&!store.reserveUsage('ai_requests',Number(process.env.DAILY_AI_LIMIT)||50))throw new Error('Daily AI request limit reached. Try tomorrow or use existing drafts.');
  const pitch=await makePitch(lead,store.list<Product>('products'),store.settings());
  // Re-read after network calls so concurrent CRM edits are not overwritten.
  const current=store.get<Lead>('leads',lead.id)!;
  store.put('leads',{...current,aiSummary:pitch.summary,aiGenerated:pitch.engine==='openai',...(pitch.engine==='openai'?{aiGrounding:{generatedAt:new Date().toISOString(),model:process.env.OPENAI_MODEL||'gpt-4.1-mini',sourceUrls:[...new Set((lead.evidence??[]).map(item=>item.url))],evidenceCount:lead.evidence?.length??0}}:{}),updatedAt:new Date().toISOString()});
  const existing=store.list<Draft>('drafts').find(d=>d.leadId===lead.id&&d.status==='draft');
  const draft:Draft={id:existing?.id??randomUUID(),leadId:lead.id,leadName:current.name,email:current.email,subject:pitch.subject,body:pitch.body,status:'draft',engine:pitch.engine,demo:current.demo,createdAt:new Date().toISOString()};
  store.put('drafts',draft);store.activity(`Outreach draft prepared for ${lead.name}.`,lead.demo,'outreach');return draft;
}
export function queueDiscovery(store:Store,input:{cities:string[];segments:Segment[];limit:number;mode:Mode;automationId?:string}):Job {
  if(input.mode==='live'&&!directorySources.some(source=>input.cities.includes(source.city)&&input.segments.includes(source.segment)))throw new Error('No automatic official directory covers this selection yet. Try bakeries in the supported cities or cafés in Delhi NCR, or import your own sourced list.');
  if(input.mode==='live'&&input.automationId&&store.get<Automation>('automations',input.automationId)?.enrichEmails&&!process.env.HUNTER_API_KEY)throw new Error('Connect Hunter before running a routine with automatic email enrichment.');
  if(store.list<Job>('jobs').filter(j=>['queued','running'].includes(j.status)).length>=10)throw new Error('The discovery queue is full. Wait for current searches to finish.');
  const job:Job={id:randomUUID(),type:'discovery',status:'queued',found:0,duplicates:0,progress:'Waiting to start',error:'',createdAt:new Date().toISOString(),...input};
  store.put('jobs',job);return job;
}
export async function runDiscovery(store:Store,job:Job) {
  job.status='running';job.progress='Looking for your next business partner';store.put('jobs',job);
  const automation=job.automationId?store.get<Automation>('automations',job.automationId):undefined;
  const created:Lead[]=[];
  try {
    if(job.mode==='live')created.push(...await discoverOfficial(store,job));
    const pairs=job.mode==='live'?[]:job.cities.flatMap(city=>job.segments.map(segment=>({city,segment})));
    let remaining=job.limit;
    for(let index=0;index<pairs.length&&remaining>0;index++){
      const {city,segment}=pairs[index];
      const quota=Math.min(60,Math.ceil(remaining/(pairs.length-index)));
      job.progress=`Searching ${segment.toLowerCase()} in ${city}`;store.put('jobs',job);
      const candidates:Lead[]=[];
      if(job.mode==='demo'){
        const prefixes=['Willow','Clover','Acorn','Sage','Bloom','Cinnamon','Fig','Poppy','Birch','Cane','Orchard','Laurel'];
        for(let i=0;i<quota;i++) candidates.push(newLead(store,{name:`${prefixes[i%prefixes.length]} ${segment==='Cafés'?'Coffee House':segment==='Bakeries'?'Bake Studio':segment==='Hotels & resorts'?'Garden Hotel':segment==='Restaurants'?'Kitchen':segment==='Caterers'?'Events':'Collective'}${i>=prefixes.length?' '+(Math.floor(i/prefixes.length)+1):''}`,city,segment,area:'Sample neighbourhood',demo:true,email:`hello${i}@sample.example`,emailSource:'Fictional example email',website:`https://sample${i}.example`,source:'Sample discovery',sourceId:`discovery:${city}:${segment}:${i}`,rating:4.5,reviews:100,value:18000,valueBasis:'Illustrative monthly opportunity, not a forecast.'}));
      }
      for(const lead of candidates){
        if(store.saveLead(lead)){
          job.found++;created.push(lead);
          if(automation?.enrichEmails&&!lead.demo&&lead.website&&!lead.email){
            job.progress=`Looking for a published business email for ${lead.name}`;store.put('jobs',job);
            if(!store.reserveUsage('enrichment_requests',Number(process.env.DAILY_ENRICHMENT_LIMIT)||50))throw new Error('Daily email enrichment request limit reached.');
            const match=await enrichEmail(lead.website);
            if(match){Object.assign(lead,{email:match.email,emailSource:match.source});Object.assign(lead,scoreLead(lead,store.list<Product>('products'),store.settings().targetCities));const current=store.get<Lead>('leads',lead.id)!;if(!current.email)store.put('leads',{...current,email:lead.email,emailSource:lead.emailSource,...scoreLead({...current,email:lead.email},store.list<Product>('products'),store.settings().targetCities),updatedAt:new Date().toISOString()});}
          }
        }else job.duplicates++;
      }
      remaining-=quota;store.put('jobs',job);
    }
    if(job.mode==='live'&&automation?.enrichEmails){
      for(const lead of created.filter(item=>item.website&&!item.email)){
        if(!store.reserveUsage('enrichment_requests',Number(process.env.DAILY_ENRICHMENT_LIMIT)||50))throw new Error('Daily email enrichment request limit reached.');
        const match=await enrichEmail(lead.website);const current=store.get<Lead>('leads',lead.id)!;
        if(match&&!current.email){
          const updated={...current,email:match.email,emailSource:match.source,contactContext:'Public company email found by Hunter. This may be shared across branches; purchasing role and permission to send marketing are unconfirmed.',...scoreLead({...current,email:match.email},store.list<Product>('products'),store.settings().targetCities)};
          store.put('leads',updated);Object.assign(lead,updated);
        }
      }
    }
    if(automation?.draftOutreach){
      for(const lead of created.filter(l=>l.score>=automation.minScore).slice(0,20)){
        job.progress=`Preparing a draft for ${lead.name}`;store.put('jobs',job);
        await createDraft(store,lead);
      }
    }
    job.status='completed';job.progress=`${job.found} new leads added · ${job.duplicates} existing locations checked${job.error?' · some sources need attention':''}`;
    store.activity(`${job.found} ${job.mode==='demo'?'sample ':''}leads discovered across ${job.cities.join(', ')}.`,job.mode==='demo','discovery');
  }catch(error){job.status='failed';job.error=error instanceof Error?error.message:'Discovery failed';job.progress=job.found?`${job.found} leads saved before the search stopped`:'Search stopped';store.activity(`Discovery needs attention: ${job.error}`,job.mode==='demo','error');}
  job.finishedAt=new Date().toISOString();store.put('jobs',job);
}
export function startWorker(store:Store) {
  // A stopped process cannot retain a running lock. Preserve partial inserts; do not re-send outreach.
  for(const job of store.list<Job>('jobs').filter(j=>j.status==='running'))store.put('jobs',{...job,status:'failed',error:'Server restarted during discovery. Partial results are saved; run again to continue.',finishedAt:new Date().toISOString()});
  let busy=false;
  const tick=async()=>{
    if(busy)return;busy=true;
    try{
      for(const rule of store.list<Automation>('automations')){
        if(!rule.enabled||Date.parse(rule.nextRun)>Date.now())continue;
        const pending=store.list<Job>('jobs').some(j=>j.automationId===rule.id&&['queued','running'].includes(j.status));
        if(pending)continue;
        try{queueDiscovery(store,{cities:rule.cities,segments:rule.segments,limit:30,mode:rule.mode,automationId:rule.id});}
        catch(error){store.activity(`Automation ${rule.name}: ${error instanceof Error?error.message:'Unable to queue'}`,rule.mode==='demo','error');}
        store.put('automations',{...rule,lastRun:new Date().toISOString(),nextRun:new Date(Date.now()+(rule.frequency==='daily'?1:7)*86400000).toISOString()});
      }
      const next=store.list<Job>('jobs').filter(j=>j.status==='queued').sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
      if(next)await runDiscovery(store,next);
    }finally{busy=false;}
  };
  const timer=setInterval(()=>{void tick().catch(error=>console.error('Worker error:',error instanceof Error?error.message:'Unknown'));},3000);
  timer.unref();return ()=>clearInterval(timer);
}
