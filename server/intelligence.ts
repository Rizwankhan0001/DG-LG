import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import { z } from 'zod';
import type { Store } from './db.js';
import type { Lead, Product } from '../shared/types.js';
import { ingredientFamilies, ingredientDemand, ingredientPriority, buyerBrief, type BuyerCompany, type BuyerProduct, type BuyerWorkspace, type SupplierMaterial, type IngredientRun, type IngredientSchedule } from '../shared/intelligence.js';
import { catalogueHosts, fetchCompanyCatalogue, matchIngredientText } from './ingredient-research.js';
import { searchInput, queueIngredientSearch, recoverIngredientSearch, runIngredientSearchTick } from './ingredient-search.js';
import type { IngredientSearch } from '../shared/intelligence.js';
import { newLead } from './service.js';

const now=()=>new Date().toISOString();
const problem=(message:string,status=400)=>Object.assign(new Error(message),{status});
const https=z.string().url().max(1500).refine(s=>s.startsWith('https://'),'Use a public HTTPS source URL.');
const optionalUrl=z.union([https,z.literal('')]);
const email=z.union([z.string().email().max(200),z.literal('')]);
const companies=(store:Store)=>store.list<BuyerCompany>('buyer_companies');
const products=(store:Store)=>store.list<BuyerProduct>('buyer_products');
export function seedIntelligence(store:Store){
  for(const [file,collection] of [['buyer-companies','buyer_companies'],['buyer-products','buyer_products'],['supplier-materials','supplier_materials']]){
    const items=JSON.parse(readFileSync(new URL(`../data/${file}.json`,import.meta.url),'utf8')) as ({id:string;checkedAt?:string;contactCheckedAt?:string;researchUpdatedAt?:string})[];
    const version=(item:typeof items[number])=>[item.checkedAt||'',item.contactCheckedAt||'',item.researchUpdatedAt||''].sort().at(-1)!;
    for(const item of items){const existing=store.get<typeof item>(collection,item.id);if(!existing||version(item)>version(existing))store.put(collection,item);}
  }
}
export function workspace(store:Store,id:string):BuyerWorkspace {
  return store.get<BuyerWorkspace>('buyer_workspaces',id)??{id,stage:'Research',saved:false,notes:'',contactName:'',contactRole:'',contactSource:'',contactEmail:'',contactVerifiedAt:'',scenarios:[],updatedAt:now()};
}
export function ingredientSchedule(store:Store):IngredientSchedule{return store.get<IngredientSchedule>('ingredient_settings','daily')??{id:'daily',enabled:false,companyIds:Object.keys(catalogueHosts),nextRun:'',lastRun:''};}
export function queueIngredientResearch(store:Store,companyIds:string[]){
  if(!companyIds.length||companyIds.length>7||companyIds.some(id=>!catalogueHosts[id]||!store.get('buyer_companies',id)))throw problem('Choose up to seven supported official catalogues.');
  if(store.list<IngredientRun>('ingredient_runs').some(r=>['queued','running'].includes(r.status)))throw problem('A research run is already in progress.');
  const run:IngredientRun={id:randomUUID(),companyIds:[...new Set(companyIds)],completedCompanyIds:[],status:'queued',createdAt:now(),scanned:0,matched:0,added:0,updated:0,warnings:[],progress:'Waiting for the research worker'};
  return store.put('ingredient_runs',run);
}
export function recoverIngredientResearch(store:Store){recoverIngredientSearch(store);for(const run of store.list<IngredientRun>('ingredient_runs').filter(r=>r.status==='running'))store.put('ingredient_runs',{...run,status:'failed',finishedAt:now(),progress:'Server restarted. Previously saved evidence is retained; start a new scan.'});}
const working=new WeakSet<Store>();
export async function runIngredientTick(store:Store){
  if(working.has(store))return;working.add(store);
  try{
    const schedule=ingredientSchedule(store);
    if(schedule.enabled&&(!schedule.nextRun||Date.parse(schedule.nextRun)<=Date.now())){
      try{queueIngredientResearch(store,schedule.companyIds);if(schedule.discovery)queueIngredientSearch(store,schedule.discovery);}catch(e){store.activity(`Ingredient research: ${(e as Error).message}`,false,'research');}
      store.put('ingredient_settings',{...schedule,lastRun:now(),nextRun:new Date(Date.now()+86400000).toISOString()});
    }
    await runIngredientSearchTick(store);
    const run=store.list<IngredientRun>('ingredient_runs').find(r=>['queued','running'].includes(r.status));if(!run)return;
    const id=run.companyIds.find(id=>!run.completedCompanyIds.includes(id));if(!id)return;
    const company=store.get<BuyerCompany>('buyer_companies',id)!;
    run.status='running';run.progress=`Reading ${company.name}’s official product catalogue`;store.put('ingredient_runs',run);
    try{
      const configured=Number(process.env.DAILY_INGREDIENT_REQUEST_LIMIT)||20;
      if(!store.reserveUsage('ingredient_catalogues',Math.max(1,Math.min(configured,100))))throw problem('Daily catalogue request limit reached.');
      const result=await fetchCompanyCatalogue(company);run.scanned+=result.scanned;run.matched+=result.products.length;
      for(const product of result.products){
        const existing=store.get<BuyerProduct>('buyer_products',product.id);
        if(existing){
          const same=existing.ingredients===product.ingredients;
          store.put('buyer_products',{...product,packGrams:product.packGrams??existing.packGrams,packNote:product.packGrams?product.packNote:existing.packNote,reviewStatus:same?existing.reviewStatus:'Needs review'});run.updated++;
        }else{store.put('buyer_products',product);run.added++;}
      }
      if(result.scanned===250)run.warnings.push(`${company.name}: 250-listing connector limit reached; coverage may be incomplete.`);
      if(!result.products.length)run.warnings.push(`${company.name}: no parseable matching ingredient lists in the catalogue feed. Existing page research was retained; check the full product pages.`);
    }catch(e){run.warnings.push(`${company.name}: ${(e as Error).message}`);}
    run.completedCompanyIds.push(id);
    if(run.completedCompanyIds.length===run.companyIds.length){run.status=run.scanned?'completed':'failed';run.finishedAt=now();run.progress=`${run.added} new product matches; ${run.updated} refreshed. Review new or changed evidence.`;}
    else run.progress=`Checked ${run.completedCompanyIds.length} of ${run.companyIds.length} catalogues`;
    store.put('ingredient_runs',run);
  }finally{working.delete(store);}
}

export function intelligenceRoutes(store:Store,readOnly=false){
  const router=Router();
  const company=(id:string)=>{const c=store.get<BuyerCompany>('buyer_companies',id);if(!c)throw problem('Buyer company not found.',404);return c;};
  const product=(id:string)=>{const p=store.get<BuyerProduct>('buyer_products',id);if(!p)throw problem('Buyer product not found.',404);return p;};
  router.get('/ingredient-intelligence',(_req,res)=>res.json({companies:companies(store),products:products(store),materials:store.list<SupplierMaterial>('supplier_materials'),workspaces:store.list<BuyerWorkspace>('buyer_workspaces'),runs:store.list<IngredientRun>('ingredient_runs').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,30),searches:store.list<IngredientSearch>('ingredient_searches').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,20),searchConfigured:!readOnly&&!!process.env.TAVILY_API_KEY,schedule:ingredientSchedule(store),workerEnabled:!readOnly&&process.env.WORKER_ENABLED!=='false',readOnly,coverage:companies(store).map(c=>({companyId:c.id,enabled:!!catalogueHosts[c.id],detail:catalogueHosts[c.id]?'Official catalogue; up to 250 listings per scan. Only explicit ingredient sections qualify. Some page-only ingredient panels need manual review.':'Manual sourced evidence; no automatic connector.'}))}));
  router.patch('/ingredient-intelligence/companies/:id',(req,res)=>{
    const c=company(req.params.id);
    const input=z.object({stage:z.enum(['Research','Find buyer','Contact verified','Sample discussion','Qualified','Not a fit']).optional(),saved:z.boolean().optional(),notes:z.string().max(12000).optional(),verification:z.object({name:z.string().trim().min(2).max(120),role:z.string().trim().min(3).max(160),source:https,email,confirmed:z.literal(true)}).optional(),clearContact:z.literal(true).optional()}).strict().parse(req.body);
    const current=workspace(store,c.id);const {verification,clearContact,...rest}=input;
    const next:BuyerWorkspace={...current,...rest,updatedAt:now()};
    if(clearContact)Object.assign(next,{contactName:'',contactRole:'',contactSource:'',contactEmail:'',contactVerifiedAt:'',stage:'Find buyer'});
    if(verification)Object.assign(next,{contactName:verification.name,contactRole:verification.role,contactSource:verification.source,contactEmail:verification.email,contactVerifiedAt:now(),stage:'Contact verified'});
    if(['Contact verified','Sample discussion','Qualified'].includes(next.stage)&&!next.contactVerifiedAt)throw problem('First record and verify the person responsible for purchasing.');
    store.put('buyer_workspaces',next);res.json(next);
  });
  router.put('/ingredient-intelligence/scenarios/:id',(req,res)=>{
    const p=product(req.params.id);
    const input=z.object({family:z.enum(ingredientFamilies),monthlyPacks:z.number().finite().min(0).max(1e9),packGrams:z.number().finite().positive().max(1e7),ingredientPercent:z.number().finite().min(0).max(100),yieldPercent:z.number().finite().min(1).max(100),supplyShare:z.number().finite().min(0).max(100),basis:z.enum(['Illustration','Buyer confirmed']),evidence:z.string().trim().max(2000)}).strict().parse(req.body);
    if(!p.matches.some(m=>m.family===input.family&&m.relation==='direct'))throw problem('Calculate a raw-material scenario only for a direct ingredient match.');
    if(input.basis==='Buyer confirmed'&&input.evidence.length<20)throw problem('Record who confirmed the production, recipe and purchasing share, when, and where the confirmation is saved.');
    const scenario={...input,productId:p.id,updatedAt:now()};ingredientDemand(scenario);
    const w=workspace(store,p.companyId);w.scenarios=w.scenarios.filter(s=>!(s.productId===p.id&&s.family===input.family));w.scenarios.push(scenario);w.updatedAt=now();store.put('buyer_workspaces',w);res.json(scenario);
  });
  router.post('/ingredient-intelligence/research',(req,res)=>{
    if(process.env.WORKER_ENABLED==='false')throw problem('Enable the private backend worker before starting research.');
    const input=z.object({companyIds:z.array(z.string()).min(1).max(7)}).strict().parse(req.body);res.status(202).json(queueIngredientResearch(store,input.companyIds));
  });
  router.post('/ingredient-intelligence/search',(req,res)=>{if(process.env.WORKER_ENABLED==='false')throw problem('Enable the private backend worker before starting search.');res.status(202).json(queueIngredientSearch(store,searchInput.parse(req.body)));});
  router.put('/ingredient-intelligence/schedule',(req,res)=>{
    const input=z.object({enabled:z.boolean(),companyIds:z.array(z.string()).min(1).max(7),discovery:searchInput.nullable().optional()}).strict().parse(req.body);
    if(input.enabled&&input.discovery&&!process.env.TAVILY_API_KEY)throw problem('Connect Tavily before scheduling nationwide web searches.');
    if(input.companyIds.some(id=>!catalogueHosts[id]))throw problem('Choose supported official catalogue sources.');
    if(input.enabled&&process.env.WORKER_ENABLED==='false')throw problem('Enable the private backend worker before scheduling research.');
    res.json(store.put('ingredient_settings',{...ingredientSchedule(store),...input,id:'daily',nextRun:input.enabled?new Date(Date.now()+86400000).toISOString():''}));
  });
  router.post('/ingredient-intelligence/products/:id/review',(req,res)=>{
    z.object({confirmed:z.literal(true)}).strict().parse(req.body);const p=product(req.params.id);
    res.json(store.put('buyer_products',{...p,reviewStatus:'Reviewed'}));
  });
  router.post('/ingredient-intelligence/companies',(req,res)=>{
    const input=z.object({name:z.string().trim().min(2).max(160),website:https,city:z.string().trim().min(2).max(120),state:z.string().trim().max(120),category:z.string().trim().min(2).max(100),contactUrl:optionalUrl,locationSource:optionalUrl}).strict().parse(req.body);
    if(input.city!=='Location to confirm'&&!input.locationSource)throw problem('Include the source for the company location, or use “Location to confirm”.');
    if(companies(store).some(c=>new URL(c.website).hostname.replace(/^www\./,'')===new URL(input.website).hostname.replace(/^www\./,'')))throw problem('This company website already exists. Select that company instead.');
    const item:BuyerCompany={...input,id:randomUUID(),description:'Company added by your team; qualify manufacturing and purchasing responsibility.',email:'',phone:'',contactCheckedAt:now(),contactNote:'User-supplied official contact route. Purchasing contact not yet verified.',contacts:[],targetRoles:['Ingredient procurement manager','Product development / R&D manager'],buyingQuestions:['Who manufactures this product and buys its ingredients?','What specifications and monthly production volumes can the purchasing team confirm?']};
    res.status(201).json(store.put('buyer_companies',item));
  });
  router.post('/ingredient-intelligence/products',(req,res)=>{
    const input=z.object({companyId:z.string(),name:z.string().trim().min(2).max(200),url:https,ingredients:z.string().trim().min(5).max(6000),packGrams:z.number().finite().positive().max(1e7).nullable(),marketplace:z.boolean()}).strict().parse(req.body);company(input.companyId);
    if(products(store).some(p=>p.url===input.url&&p.companyId===input.companyId))throw problem('This product source is already recorded. Review its existing profile.');
    const matches=matchIngredientText(input.ingredients);if(!matches.length)throw problem('No supported ingredient found in the supplied ingredient list. Do not enter marketing or recipe instructions.');
    const {marketplace,...rest}=input;
    const item:BuyerProduct={...rest,id:randomUUID(),image:'',imageSource:'',packNote:'Weight entered by your team; confirm the unit on the product label.',ingredientsSource:marketplace?'Marketplace listing':'User supplied',matches,checkedAt:now(),reviewStatus:'Needs review',status:'Active listing',discoveredBy:'User import'};
    res.status(201).json(store.put('buyer_products',item));
  });
  router.post('/ingredient-intelligence/companies/:id/lead',(req,res)=>{
    const c=company(req.params.id),w=workspace(store,c.id);
    if(!w.contactVerifiedAt)throw problem('Record a verified purchasing or product-development contact before adding this company to sales.');
    const existing=store.list<Lead>('leads').find(l=>l.sourceId===`ingredient-buyer:${c.id}`&&!l.demo);if(existing)return res.json(existing);
    const matches=products(store).filter(p=>p.companyId===c.id&&p.reviewStatus==='Reviewed'&&p.matches.some(m=>m.relation==='direct'));
    if(!matches.length)throw problem('Review at least one direct ingredient match before creating a sales lead.');
    const materials=store.list<SupplierMaterial>('supplier_materials');
    const supplierIds=[...new Set(matches.flatMap(p=>p.matches.filter(m=>m.relation==='direct').flatMap(m=>materials.filter(s=>s.family===m.family).flatMap(s=>s.productIds))))];
    const lead=newLead(store,{name:c.name,city:c.city,segment:'Food manufacturers',website:c.website,source:'Published product ingredients',sourceId:`ingredient-buyer:${c.id}`,sourceUrl:matches[0].url,sourceAt:matches[0].checkedAt,email:w.contactEmail,emailSource:w.contactEmail?w.contactSource:'',buyerCompanyId:c.id,saved:true,stage:'Qualified',contactContext:`${w.contactName} · ${w.contactRole}. Identity and role recorded by your team; outreach permission is separate.`,tags:['Ingredient match','Purchasing contact verified'],notes:[{id:randomUUID(),text:matches.map(p=>buyerBrief(c,p,w)).join('\n\n'),createdAt:now()}]});
    lead.products=supplierIds.filter(id=>!!store.get<Product>('products',id));lead.score=Math.max(...matches.map(p=>ingredientPriority(p,c,w).score));lead.scoreReasons=['Research priority based on published ingredient evidence; not a conversion probability.'];
    if(!store.saveLead(lead))throw problem('A matching sales lead already exists. Find it in the sales workspace before adding another.');
    store.put('buyer_workspaces',{...w,leadId:lead.id,updatedAt:now()});store.activity(`Added ${c.name} to sales from reviewed ingredient evidence.`,false,'research');res.status(201).json(lead);
  });
  return router;
}
