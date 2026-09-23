import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { z, ZodError } from 'zod';
import Papa from 'papaparse';
import type { Store } from './db.js';
import { cities, segments, stages, contactOutcomes, type Lead, type Product, type Draft, type Automation, type Job, type Mode, type Activity } from '../shared/types.js';
import { csvCell, scoreLead } from './scoring.js';
import { enrichEmail, integrations, providerRequest, searchPlaces } from './providers.js';
import { createDraft, newLead, queueDiscovery } from './service.js';
import { businessDate } from '../shared/workflow.js';
import { readiness } from './readiness.js';
import { dataReport } from './data-quality.js';
import { calculateDemand, defaultPlan, useCases } from '../shared/opportunity.js';

const modeSchema=z.enum(['demo','live']).default('live');
const urlSchema=z.union([z.literal(''),z.string().url().refine(s=>/^https?:\/\//.test(s),'Use an http or https URL')]);
const leadInput=z.object({name:z.string().trim().min(2).max(160),city:z.enum(cities),segment:z.enum(segments),area:z.string().max(400).default(''),email:z.union([z.literal(''),z.string().email().max(200)]).default(''),phone:z.string().max(40).default(''),website:urlSchema.default(''),owner:z.string().max(80).default('You')});
const discoveryInput=z.object({cities:z.array(z.enum(cities)).min(1).max(10),segments:z.array(z.enum(segments)).min(1).max(8),limit:z.number().int().min(1).max(500).default(100),mode:modeSchema});
const automationInput=z.object({name:z.string().trim().min(3).max(100),cities:z.array(z.enum(cities)).min(1).max(10),segments:z.array(z.enum(segments)).min(1).max(8),frequency:z.enum(['daily','weekly']),enabled:z.boolean().default(false),mode:modeSchema,minScore:z.number().int().min(0).max(100).default(70),draftOutreach:z.boolean().default(true),enrichEmails:z.boolean().default(false)});
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const asyncRoute=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const error=(message:string,status=400)=>Object.assign(new Error(message),{status});

export function createApp(store:Store,options:{readOnly?:boolean}={}) {
  const app=express();
  const readOnly=options.readOnly===true;
  const production=process.env.NODE_ENV==='production';
  const password=readOnly?'':process.env.ADMIN_PASSWORD||'';
  if(production && !readOnly && (password.length<12 || !process.env.APP_URL?.startsWith('https://')))throw new Error('Production requires ADMIN_PASSWORD (12+ characters) and an HTTPS APP_URL.');
  const passwordHash=password?bcrypt.hashSync(password,12):'';
  app.disable('x-powered-by');
  app.set('trust proxy',1);
  app.use(helmet({contentSecurityPolicy:production?{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],styleSrc:["'self'","'unsafe-inline'"],imgSrc:["'self'",'data:','https://cdn.shopify.com'],fontSrc:["'self'"],connectSrc:["'self'"],upgradeInsecureRequests:[]}}:false}));
  app.use(express.json({limit:'2mb'}));app.use(express.urlencoded({extended:false,limit:'8kb'}));app.use(cookieParser());
  app.get('/api/health',(_req,res)=>res.json({ok:true,service:'dhampur-green-grow'}));
  app.use('/api',(req,res,next)=>{
    res.setHeader('Cache-Control','no-store');
    if(readOnly&&!['GET','HEAD','OPTIONS'].includes(req.method))return res.status(503).json({error:'This live preview is read-only. Saving, automated searches and sending will be available after the cloud backend is connected.'});
    next();
  });
  app.use('/api',rateLimit({windowMs:60000,limit:240,standardHeaders:'draft-7',legacyHeaders:false,message:{error:'Too many requests. Please try again in a minute.'}}));
  app.use('/api',(req,res,next)=>{
    if(['GET','HEAD','OPTIONS'].includes(req.method)||req.path==='/unsubscribe')return next();
    if(req.get('X-Requested-With')!=='Grow')return res.status(403).json({error:'Request verification failed.'});
    const origin=req.get('Origin');
    const allowed=new Set([process.env.APP_URL||'http://localhost:5173',...(!production?['http://127.0.0.1:5173','http://localhost:5173','http://127.0.0.1:3001','http://localhost:3001']:[])]);
    if(origin&&!allowed.has(origin))return res.status(403).json({error:'Origin is not allowed.'});
    next();
  });
  const isAuthed=(req:Request)=>{
    if(!password)return true;
    const token=req.cookies.grow_session;
    return typeof token==='string'&&!!store.db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(hash(token),Date.now());
  };
  app.get('/api/auth/status',(req,res)=>res.json({authenticated:isAuthed(req),required:!!password}));
  app.post('/api/auth/login',rateLimit({windowMs:900000,limit:10,message:{error:'Too many login attempts. Please wait 15 minutes.'}}),asyncRoute(async(req,res)=>{
    const input=z.object({email:z.string().email(),password:z.string().max(200)}).parse(req.body);
    if(!passwordHash||input.email.toLowerCase()!==(process.env.ADMIN_EMAIL||'admin@dhampurgreen.com').toLowerCase()||!await bcrypt.compare(input.password,passwordHash))return res.status(401).json({error:'Incorrect email or password.'});
    const token=randomBytes(32).toString('hex');
    store.db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());
    store.db.prepare('INSERT INTO sessions VALUES(?,?)').run(hash(token),Date.now()+7*86400000);
    res.cookie('grow_session',token,{httpOnly:true,sameSite:'lax',secure:production,maxAge:7*86400000,path:'/'});res.json({ok:true});
  }));
  app.post('/api/auth/logout',(req,res)=>{if(req.cookies.grow_session)store.db.prepare('DELETE FROM sessions WHERE token=?').run(hash(req.cookies.grow_session));res.clearCookie('grow_session',{path:'/'}).json({ok:true});});
  // A token only identifies its own recipient and cannot unsubscribe arbitrary email addresses.
  app.get('/api/unsubscribe',(req,res)=>{
    const token=z.string().regex(/^[a-f0-9]{64}$/).safeParse(req.query.token);
    if(!token.success||!store.db.prepare('SELECT email FROM unsubscribe_tokens WHERE token=?').get(token.data))return res.status(404).send('This unsubscribe link is invalid.');
    res.type('html').send(`<!doctype html><meta name="viewport" content="width=device-width"><title>Dhampur Green preferences</title><main style="max-width:520px;margin:80px auto;font-family:system-ui;padding:24px"><h1>Email preferences</h1><p>Stop business outreach emails from Dhampur Green.</p><form method="post" action="/api/unsubscribe"><input type="hidden" name="token" value="${token.data}"><button style="padding:12px 20px">Unsubscribe</button></form></main>`);
  });
  app.post('/api/unsubscribe',(req,res)=>{
    const token=z.string().regex(/^[a-f0-9]{64}$/).parse(req.body.token);
    const row=store.db.prepare('SELECT email FROM unsubscribe_tokens WHERE token=?').get(token) as {email:string}|undefined;
    if(!row)return res.status(404).send('Invalid unsubscribe link.');
    store.db.prepare('INSERT OR IGNORE INTO suppressions VALUES(?,?)').run(row.email.toLowerCase(),new Date().toISOString());
    for(const lead of store.list<Lead>('leads').filter(l=>l.email.toLowerCase()===row.email.toLowerCase()))store.put('leads',{...lead,suppressed:true});
    res.type('html').send('<!doctype html><title>Unsubscribed</title><main style="font-family:system-ui;max-width:520px;margin:80px auto;padding:24px"><h1>You’re unsubscribed.</h1><p>You will no longer receive business outreach from Dhampur Green.</p></main>');
  });
  app.use('/api',(req,res,next)=>isAuthed(req)?next():res.status(401).json({error:'Please sign in to continue.'}));
  const findLead=(id:string)=>{const lead=store.get<Lead>('leads',id);if(!lead)throw error('Lead not found.',404);return lead;};
  app.get('/api/data-quality',(_req,res)=>res.json(dataReport(store)));
  app.post('/api/leads/:id/google-check',asyncRoute(async(req,res)=>{
    const lead=findLead(req.params.id);if(lead.demo)throw error('Switch to a real business to check a listing.');
    if(!process.env.GOOGLE_PLACES_API_KEY)throw error('Add GOOGLE_PLACES_API_KEY in server settings to check current listings.');
    if(!store.reserveUsage('places_requests',Number(process.env.DAILY_DISCOVERY_LIMIT)||100))throw error('Daily Google listing check limit reached.');
    const result=await searchPlaces(lead.city,lead.segment,3,undefined,`${lead.name} ${lead.area} ${lead.city} India`);
    res.setHeader('Cache-Control','no-store');
    res.json({places:result.places,checkedAt:new Date().toISOString()});
  }));
  app.get('/api/readiness',(_req,res)=>{
    const state=readiness(store);
    if(readOnly){state.databaseHealthy=false;state.schedulerEnabled=false;state.backupsConfigured=false;state.loginProtected=false;state.checks=state.checks.map(check=>({...check,ready:check.id==='hosting',detail:check.id==='hosting'?'The read-only preview is published.':'This preview contains public research only. Connect the cloud backend to enable a private, persistent workspace.'}));}
    res.json(state);
  });
  app.get('/api/bootstrap',(req,res)=>{
    const mode=modeSchema.parse(req.query.mode);const demo=mode==='demo';
    res.json({mode,readOnly,authenticated:true,leads:store.list<Lead>('leads').filter(l=>l.demo===demo).sort((a,b)=>b.score-a.score),products:store.list<Product>('products'),drafts:store.list<Draft>('drafts').filter(d=>d.demo===demo).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)),automations:store.list<Automation>('automations').filter(a=>a.mode===mode),jobs:store.list<Job>('jobs').filter(j=>j.mode===mode).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30),activities:store.list<Activity>('activities').filter(a=>a.demo===demo).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30),settings:store.settings(),integrations:integrations()});
  });
  app.post('/api/leads',(req,res)=>{
    const input=leadInput.parse(req.body);const mode=modeSchema.parse(req.body.mode);
    const lead=newLead(store,{...input,demo:mode==='demo',emailSource:input.email?'User provided':''});
    if(!store.saveLead(lead))throw error('This business is already in your workspace.',409);
    store.activity(`${lead.name} added to your leads.`,lead.demo);res.status(201).json(lead);
  });
  app.patch('/api/leads/:id',(req,res)=>{
    const lead=findLead(req.params.id);
    const patch=z.object({stage:z.enum(stages).optional(),saved:z.boolean().optional(),value:z.number().min(0).max(1e10).optional(),owner:z.string().max(80).optional(),email:z.union([z.literal(''),z.string().email()]).optional(),phone:z.string().max(40).optional(),website:urlSchema.optional(),nextFollowUp:z.union([z.literal(''),z.string().date()]).optional(),suppressed:z.boolean().optional()}).strict().parse(req.body);
    const updated={...lead,...patch,updatedAt:new Date().toISOString(),...(patch.email!==undefined&&patch.email!==lead.email?{emailSource:'User provided'}:{}),...(patch.value!==undefined?{valueBasis:'User-entered monthly opportunity estimate. Not confirmed revenue.'}:{})};
    updated.evidence=lead.evidence?.filter(item=>!(item.field==='email'&&patch.email!==undefined&&patch.email!==lead.email)&&!(item.field==='phone'&&patch.phone!==undefined&&patch.phone!==lead.phone));
    if((patch.email!==undefined&&patch.email!==lead.email)||(patch.phone!==undefined&&patch.phone!==lead.phone))updated.contactContext='Contact details edited in this workspace. Confirm the role and purchasing responsibility before outreach.';
    Object.assign(updated,scoreLead(updated,store.list<Product>('products'),store.settings().targetCities));
    store.put('leads',updated);
    if(patch.suppressed&&lead.email)store.db.prepare('INSERT OR IGNORE INTO suppressions VALUES(?,?)').run(lead.email.toLowerCase(),new Date().toISOString());
    if(patch.stage&&patch.stage!==lead.stage)store.activity(`${lead.name} moved to ${patch.stage.toLowerCase()}.`,lead.demo,'pipeline');
    res.json(updated);
  });
  app.get('/api/leads/:id/opportunity',(req,res)=>{
    const lead=findLead(req.params.id);const plan=lead.demandPlan??defaultPlan(lead.segment);
    res.json({plan,estimate:calculateDemand(lead.segment,plan),basis:lead.demandPlan?'Saved planning assumptions':'Illustrative category assumptions',confirmedDemand:false});
  });
  app.post('/api/leads/:id/research-review',(req,res)=>{
    const lead=findLead(req.params.id);
    const {fields}=z.object({fields:z.array(z.enum(['name','area','phone','email'])).min(1).max(4)}).strict().parse(req.body);
    const check=lead.researchCheck;if(!check)throw error('No source differences are available to review.');
    const changes=check.changes.filter(change=>fields.includes(change.field));
    if(!changes.length)throw error('These details have already been reviewed.');
    const updated={...lead,evidence:[...(lead.evidence??[]).filter(item=>!fields.includes(item.field)),...changes.map(change=>({field:change.field,value:change.published,url:check.url,checkedAt:check.checkedAt}))],researchCheck:{...check,changes:check.changes.filter(change=>!fields.includes(change.field))},updatedAt:new Date().toISOString()};
    for(const change of changes)updated[change.field]=change.published;
    Object.assign(updated,scoreLead(updated,store.list<Product>('products'),store.settings().targetCities));
    store.put('leads',updated);store.activity(`Reviewed source details updated for ${lead.name}.`,lead.demo,'research');res.json(updated);
  });
  app.put('/api/leads/:id/demand-plan',(req,res)=>{
    const lead=findLead(req.params.id);
    const input=z.object({useCaseId:z.string(),dailyLow:z.number().finite().min(0).max(100000),dailyHigh:z.number().finite().min(0).max(100000),days:z.number().int().min(1).max(31),portion:z.number().finite().positive().max(100000),supplyShare:z.number().finite().min(0).max(100),notes:z.string().trim().max(1500)}).strict().refine(p=>p.dailyHigh>=p.dailyLow,{message:'The upper daily quantity must be at least the lower quantity.',path:['dailyHigh']}).parse(req.body);
    if(!useCases(lead.segment,store.list<Product>('products')).some(c=>c.id===input.useCaseId))throw error('Choose a product use that matches this buyer category and catalogue.');
    const now=new Date().toISOString();
    const updated={...lead,demandPlan:{...input,updatedAt:now},updatedAt:now};
    store.put('leads',updated);store.activity(`Product requirement scenario saved for ${lead.name}. Actual demand needs buyer confirmation.`,lead.demo,'opportunity');res.json(updated);
  });
  app.post('/api/leads/:id/contact-log',(req,res)=>{
    const lead=findLead(req.params.id);
    const input=z.object({channel:z.enum(['Call','Email','Meeting']),outcome:z.enum(contactOutcomes),summary:z.string().trim().min(3).max(2000),nextFollowUp:z.union([z.literal(''),z.string().date()]),stage:z.enum(stages)}).strict().parse(req.body);
    if(input.nextFollowUp&&input.nextFollowUp<businessDate())throw error('Choose today or a future date for the next follow-up.');
    if((lead.suppressed||['Won','Lost'].includes(input.stage))&&input.nextFollowUp)throw error('Closed or do-not-contact businesses cannot have a new follow-up.');
    const now=new Date().toISOString();
    const entry={id:randomUUID(),channel:input.channel,outcome:input.outcome,summary:input.summary,nextFollowUp:input.nextFollowUp,createdAt:now};
    const updated={...lead,stage:input.stage,nextFollowUp:input.nextFollowUp,contactHistory:[...(lead.contactHistory??[]),entry],updatedAt:now};
    store.put('leads',updated);store.activity(`${input.channel} logged for ${lead.name}: ${input.outcome.toLowerCase()}.`,lead.demo,'contact');
    res.status(201).json(updated);
  });
  app.post('/api/leads/:id/notes',(req,res)=>{
    const lead=findLead(req.params.id);const {text}=z.object({text:z.string().trim().min(1).max(3000)}).parse(req.body);
    const updated={...lead,notes:[...lead.notes,{id:randomUUID(),text,createdAt:new Date().toISOString()}],updatedAt:new Date().toISOString()};store.put('leads',updated);res.status(201).json(updated);
  });
  app.post('/api/leads/:id/enrich',asyncRoute(async(req,res)=>{
    const lead=findLead(req.params.id);if(lead.demo)throw error('Sample leads have fictional contact details. Switch to live leads for enrichment.');
    if(!lead.website)throw error('Add the business website before finding an email.');
    if(!process.env.HUNTER_API_KEY)throw error('Connect Hunter in Settings to find published business emails.');
    if(!store.reserveUsage('enrichment_requests',Number(process.env.DAILY_ENRICHMENT_LIMIT)||50))throw error('Daily email enrichment request limit reached.');
    const email=await enrichEmail(lead.website);if(!email)return res.json({found:false,message:'No published business email found for this domain.'});
    const current=findLead(lead.id);const updated={...current,email:email.email,emailSource:email.source,evidence:current.evidence?.filter(item=>item.field!=='email'),contactContext:'Email found through Hunter domain search. Confirm the contact role and purchasing responsibility.',updatedAt:new Date().toISOString()};
    Object.assign(updated,scoreLead(updated,store.list<Product>('products'),store.settings().targetCities));store.put('leads',updated);res.json({found:true,lead:updated});
  }));
  app.post('/api/leads/:id/draft',asyncRoute(async(req,res)=>res.status(201).json(await createDraft(store,findLead(req.params.id)))));
  app.post('/api/leads/import',(req,res)=>{
    const {csv,mode}=z.object({csv:z.string().max(1500000),mode:modeSchema}).parse(req.body);
    const parsed=Papa.parse<Record<string,string>>(csv,{header:true,skipEmptyLines:'greedy',transformHeader:h=>h.trim().toLowerCase()});
    if(parsed.errors.length)throw error(`CSV could not be read: ${parsed.errors[0].message}`);
    if(parsed.data.length>500)throw error('Import up to 500 rows at a time.');
    if(!parsed.data.length)throw error('The CSV has no data rows.');
    let imported=0,duplicates=0;const errors:{row:number;message:string}[]=[];
    store.db.transaction(()=>{parsed.data.forEach((row,index)=>{
      const parsedRow=leadInput.safeParse(row);
      if(!parsedRow.success){errors.push({row:index+2,message:parsedRow.error.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});return;}
      const lead=newLead(store,{...parsedRow.data,demo:mode==='demo',source:'CSV import',emailSource:parsedRow.data.email?'CSV import':''});
      if(store.saveLead(lead))imported++;else duplicates++;
    });})();
    store.activity(`${imported} leads imported from CSV.`,mode==='demo','import');res.json({imported,duplicates,errors});
  });
  app.get('/api/leads/export',(req,res)=>{
    const mode=modeSchema.parse(req.query.mode);const ids=typeof req.query.ids==='string'?new Set(req.query.ids.split(',')):null;
    const leads=store.list<Lead>('leads').filter(l=>l.demo===(mode==='demo')&&(!ids||ids.has(l.id)));
    const fields:(keyof Lead)[]=['name','city','area','segment','stage','score','email','phone','website','value','valueBasis','owner','nextFollowUp','source','sourceUrl','sourceAt','emailSource','demo'];
    res.setHeader('Content-Disposition',`attachment; filename="dhampur-green-${mode}-leads.csv"`);res.type('text/csv').send('\ufeff'+fields.join(',')+'\r\n'+leads.map(l=>fields.map(f=>csvCell(l[f])).join(',')).join('\r\n'));
  });
  app.post('/api/discover',(req,res)=>res.status(202).json(queueDiscovery(store,discoveryInput.parse(req.body))));
  app.post('/api/automations',(req,res)=>{
    const input=automationInput.parse(req.body);

    const item={...input,id:randomUUID(),lastRun:null,nextRun:new Date(Date.now()+86400000).toISOString(),createdAt:new Date().toISOString()};store.put('automations',item);res.status(201).json(item);
  });
  app.patch('/api/automations/:id',(req,res)=>{
    const item=store.get<Automation>('automations',req.params.id);if(!item)throw error('Automation not found.',404);
    const {enabled}=z.object({enabled:z.boolean()}).parse(req.body);

    const updated={...item,enabled};store.put('automations',updated);res.json(updated);
  });
  app.delete('/api/automations/:id',(req,res)=>{store.remove('automations',req.params.id);res.json({ok:true});});
  app.post('/api/automations/:id/run',(req,res)=>{
    const item=store.get<Automation>('automations',req.params.id);if(!item)throw error('Automation not found.',404);
    const job=queueDiscovery(store,{cities:item.cities,segments:item.segments,limit:30,mode:item.mode,automationId:item.id});store.put('automations',{...item,lastRun:new Date().toISOString()});res.status(202).json(job);
  });
  app.patch('/api/drafts/:id',(req,res)=>{
    const draft=store.get<Draft>('drafts',req.params.id);if(!draft)throw error('Draft not found.',404);
    if(['sent','sending'].includes(draft.status)||draft.delivery)throw error('An email already submitted for sending cannot be edited. This preserves safe retries.');
    const input=z.object({subject:z.string().trim().min(1).max(180),body:z.string().trim().min(1).max(8000)}).parse(req.body);
    const updated={...draft,...input,status:'draft' as const};store.put('drafts',updated);res.json(updated);
  });
  app.post('/api/drafts/:id/send',asyncRoute(async(req,res)=>{
    z.object({reviewed:z.literal(true)}).parse(req.body);
    const draft=store.get<Draft>('drafts',req.params.id);if(!draft)throw error('Draft not found.',404);
    if(draft.status==='sent')return res.json(draft);
    if(draft.status==='sending')throw error('This email is already being submitted. Please wait.',409);
    if(draft.demo)throw error('Sample emails cannot be sent. Switch to your live workspace.');
    if(process.env.OUTREACH_ENABLED!=='true'||!process.env.RESEND_API_KEY||!process.env.OUTREACH_FROM)throw error('Configure Resend, a verified sender, and OUTREACH_ENABLED in your server environment.');
    const lead=findLead(draft.leadId);
    if(!z.string().email().safeParse(lead.email).success||lead.email.endsWith('.example'))throw error('Add a valid business email to this lead first.');
    if(lead.suppressed||store.db.prepare('SELECT email FROM suppressions WHERE email=?').get(lead.email.toLowerCase()))throw error('This recipient is on your do-not-contact list.');
    if(draft.delivery&&draft.delivery.payload.to[0]!==lead.email)throw error('The recipient has changed since the first send attempt. Check the original message in Resend before preparing a new one.');
    if(draft.delivery&&Date.now()-Date.parse(draft.delivery.startedAt)>23*60*60*1000)throw error('The retry window has expired. Check delivery in Resend before preparing a new email.');
    if(!store.reserveUsage('email_attempts',Number(process.env.DAILY_EMAIL_LIMIT)||30))throw error('Daily email limit reached.');
    let delivery=draft.delivery;
    if(!delivery){
      const token=randomBytes(32).toString('hex');store.db.prepare('INSERT INTO unsubscribe_tokens VALUES(?,?)').run(token,lead.email.toLowerCase());
      const unsubscribe=`${process.env.APP_URL||'http://localhost:5173'}/api/unsubscribe?token=${token}`;
      delivery={startedAt:new Date().toISOString(),payload:{from:process.env.OUTREACH_FROM,to:[lead.email],subject:draft.subject,text:`${draft.body}\n\nTo stop receiving business emails: ${unsubscribe}`,...(process.env.OUTREACH_REPLY_TO?{reply_to:process.env.OUTREACH_REPLY_TO}:{})}};
    }
    store.put('drafts',{...draft,delivery,status:'sending',email:lead.email});
    try{
      const result=await providerRequest('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`grow-draft-${draft.id}`},body:JSON.stringify(delivery.payload)},'Resend');
      const providerId=z.string().min(1).parse(result.id);
      const updated={...draft,delivery,email:lead.email,status:'sent' as const,sentAt:new Date().toISOString(),providerId};store.put('drafts',updated);
      const current=findLead(lead.id);if(['New','Qualified'].includes(current.stage))store.put('leads',{...current,stage:'Contacted',updatedAt:new Date().toISOString()});
      store.activity(`Email submitted to Resend for ${lead.name}.`,false,'outreach');res.json(updated);
    }catch(e){store.put('drafts',{...draft,delivery,status:'failed',error:e instanceof Error?e.message:'Sending failed'});throw e;}
  }));
  app.patch('/api/settings',(req,res)=>{
    const input=z.object({company:z.string().min(2).max(100),senderName:z.string().min(2).max(100),targetCities:z.array(z.enum(cities)).min(1),monthlyTarget:z.number().min(0).max(1e10),defaultDealValue:z.number().min(0).max(1e9),signature:z.string().max(500)}).parse(req.body);
    store.put('settings',{id:'business',...input});
    for(const lead of store.list<Lead>('leads'))store.put('leads',{...lead,...scoreLead(lead,store.list<Product>('products'),input.targetCities)});
    res.json(input);
  });
  app.get('/api/integrations',(_req,res)=>res.json(integrations()));
  app.use('/api',(_req,res)=>res.status(404).json({error:'This API endpoint does not exist.'}));
  if(production){app.use(express.static(resolve('dist')));app.get('*',(_req,res)=>res.sendFile(resolve('dist/index.html')));}
  app.use((err:Error&{status?:number},_req:Request,res:Response,_next:NextFunction)=>{
    if(err instanceof ZodError)return res.status(400).json({error:err.issues.map(i=>`${i.path.join('.')}: ${i.message}`).join('; ')});
    if(err.message?.includes('UNIQUE constraint'))return res.status(409).json({error:'This item already exists.'});
    const status=err.status??400;res.status(status).json({error:status>=500?'Something went wrong. Please try again.':err.message||'Request failed.'});
  });
  return app;
}
