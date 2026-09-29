import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './db.js';
import { ingredientFamilies, type IngredientSearch, type IngredientSearchInput } from '../shared/intelligence.js';

export const searchInput=z.object({family:z.enum(ingredientFamilies),industry:z.string().trim().min(2).max(100),location:z.string().trim().min(2).max(100),marketplace:z.boolean()}).strict();
const words:Record<IngredientSearchInput['family'],string>={'Cane jaggery':'jaggery','Khandsari / khand':'khandsari khand','Palm jaggery':'palm jaggery','Coconut jaggery':'coconut jaggery','Brown sugar':'brown sugar muscovado','White / baking sugar':'sugar','Molasses':'molasses treacle'};
export function queueIngredientSearch(store:Store,input:IngredientSearchInput){
  if(!process.env.TAVILY_API_KEY)throw Object.assign(new Error('Connect TAVILY_API_KEY in the private backend to discover additional brands across India. Official catalogue scans work without it.'),{status:400});
  if(store.list<IngredientSearch>('ingredient_searches').some(s=>['queued','running'].includes(s.status)))throw Object.assign(new Error('A nationwide product search is already in progress.'),{status:400});
  const parsed=searchInput.parse(input);
  const query=`${words[parsed.family]} ${parsed.industry} product ingredients ${parsed.location} India ${parsed.marketplace?'site:amazon.in':'brand manufacturer -site:amazon.in -site:dhampurgreen.com'}`;
  return store.put<IngredientSearch>('ingredient_searches',{...parsed,id:randomUUID(),query,createdAt:new Date().toISOString(),status:'queued',error:'',results:[]});
}
export function recoverIngredientSearch(store:Store){for(const s of store.list<IngredientSearch>('ingredient_searches').filter(s=>s.status==='running'))store.put('ingredient_searches',{...s,status:'failed',error:'Server restarted during web search; rerun when ready.',finishedAt:new Date().toISOString()});}
const working=new WeakSet<Store>();
export async function runIngredientSearchTick(store:Store){
  if(working.has(store))return;working.add(store);
  try{const job=store.list<IngredientSearch>('ingredient_searches').find(s=>s.status==='queued');if(!job)return;
    store.put('ingredient_searches',{...job,status:'running'});
    try{
      if(!process.env.TAVILY_API_KEY)throw new Error('Tavily search is not connected.');
      if(!store.reserveUsage('ingredient_web_search',Math.max(1,Math.min(Number(process.env.DAILY_INGREDIENT_SEARCH_LIMIT)||10,100))))throw new Error('Daily nationwide search request limit reached.');
      const response=await fetch('https://api.tavily.com/search',{method:'POST',redirect:'error',signal:AbortSignal.timeout(25000),headers:{Authorization:`Bearer ${process.env.TAVILY_API_KEY}`,'Content-Type':'application/json'},body:JSON.stringify({query:job.query,topic:'general',search_depth:'basic',country:'india',max_results:20,include_answer:false,include_raw_content:false,include_images:false,auto_parameters:false,...(job.marketplace?{include_domains:['amazon.in']}:{exclude_domains:['dhampurgreen.com','amazon.in']})})});
      if(!response.ok)throw new Error(`Search provider returned HTTP ${response.status}. Check its connection and usage allowance.`);
      const raw=await response.text();if(raw.length>2_000_000)throw new Error('Search response exceeded the size limit.');
      const parsed=z.object({results:z.array(z.object({title:z.string(),url:z.string(),content:z.string().nullable().optional()})).max(30)}).parse(JSON.parse(raw));
      const seen=new Set<string>();const results=parsed.results.filter(r=>{try{const u=new URL(r.url);if(u.protocol!=='https:'||u.username||u.password||seen.has(u.href))return false;seen.add(u.href);return true;}catch{return false;}}).map(r=>({title:r.title.slice(0,250),url:r.url,excerpt:(r.content||'').slice(0,1200)}));
      store.put('ingredient_searches',{...job,status:'completed',results,finishedAt:new Date().toISOString()});
    }catch(e){store.put('ingredient_searches',{...job,status:'failed',error:(e as Error).message,finishedAt:new Date().toISOString()});}
  }finally{working.delete(store);}
}
