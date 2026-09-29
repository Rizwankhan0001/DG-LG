import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { createStore } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { matchIngredientText, ingredientSection, productFromCatalogue } from '../server/ingredient-research.js';
import { seedIntelligence, queueIngredientResearch, runIngredientTick, recoverIngredientResearch } from '../server/intelligence.js';
import { ingredientDemand, ingredientPriority, type BuyerScenario, type BuyerCompany, type BuyerProduct, type IngredientBootstrap, type IngredientRun } from '../shared/intelligence.js';
import { productFitsLead } from '../shared/catalogue.js';
import { scoreLead } from '../server/scoring.js';
import { buildAudience } from '../shared/campaigns.js';
import { queueIngredientSearch, runIngredientSearchTick } from '../server/ingredient-search.js';
import type { Product, Lead } from '../shared/types.js';

const catalogue=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')) as Product[];
const nativeFetch=globalThis.fetch;
test('ingredient matching respects components, negations and exact published percentages',()=>{
  const result=matchIngredientText('Flour, Chocolate (Cocoa, Khandsari Sugar), Jaggery (16%), Sugar (8%), Palm jaggery, Coconut jaggery');
  assert.equal(result.find(m=>m.family==='Khandsari / khand')?.relation,'compound');
  assert.equal(result.find(m=>m.family==='Cane jaggery')?.percent,16);
  assert.equal(result.find(m=>m.family==='White / baking sugar')?.percent,8);
  assert.equal(result.filter(m=>m.family==='Cane jaggery').length,1);
  const chip=matchIngredientText('Chips (9%) [Sugar, Cocoa], Jaggery (8%), Sugar (8%)');
  assert.equal(chip.filter(m=>m.family==='White / baking sugar').length,2);
  assert.equal(chip.find(m=>m.family==='White / baking sugar'&&m.relation==='direct')?.percent,8);
  assert.equal(chip.find(m=>m.family==='White / baking sugar'&&m.relation==='compound')?.percent,null);
  assert.equal(matchIngredientText('No added sugar. Without jaggery. No refined sugar.').length,0);
  assert.equal(matchIngredientText('Cacao Nibs, Khandsari, Vanilla')[0].percent,null);
  assert.equal(matchIngredientText('Peanuts (70%), Jaggery, Cardamom')[0].percent,null);
});
test('recipes, nutrition panels and marketing do not become ingredient evidence',()=>{
  const kheer='<p>Delicious kheer</p><!-- split --><p>Benefits</p><!-- split --><p>Red rice 80%, dates 9%, almonds 6%, makhana 5%</p><!-- split --><p>How to cook: add jaggery powder</p>';
  assert.equal(matchIngredientText(ingredientSection('earlyfoods',kheer)).length,0);
  assert.equal(ingredientSection('slurrp-farm','<p>Made with raw unrefined sugar and jaggery powder. 100% vegetarian, no preservatives, no colours, no flavours.</p>'),'');
  const html='<h5>Ingredients</h5><p>Cacao Nibs, Khandsari, Vanilla</p><h5>Nutritional Information</h5><p>Total Sugar 30g</p>';
  const found=ingredientSection('the-snack-company',html);assert.equal(found,'Cacao Nibs, Khandsari, Vanilla');assert.equal(matchIngredientText(found)[0].percent,null);
});
test('quantity calculations disclose inputs and reject invalid dimensions',()=>{
  const scenario:BuyerScenario={productId:'test',family:'Cane jaggery',monthlyPacks:10000,packGrams:700,ingredientPercent:16,yieldPercent:100,supplyShare:25,basis:'Illustration',evidence:''};
  assert.deepEqual(ingredientDemand(scenario),{finishedKg:7000,ingredientKg:1120,addressableKg:280});
  assert.equal(ingredientDemand({...scenario,yieldPercent:80}).addressableKg,350);
  for(const patch of [{yieldPercent:0},{yieldPercent:0.5},{ingredientPercent:101},{monthlyPacks:-1},{packGrams:NaN},{supplyShare:101}])assert.throws(()=>ingredientDemand({...scenario,...patch}));
});
test('seed evidence retains customer notes and ranks direct uses over component leads',()=>{
  const store=createStore(':memory:');try{seedIntelligence(store);const before=store.list<BuyerProduct>('buyer_products');assert.equal(before.length,33);assert.equal(new Set(before.map(p=>p.companyId)).size,7);
    store.put('buyer_workspaces',{id:'true-elements',notes:'Do not lose this buyer conversation'});seedIntelligence(store);assert.equal(store.get<{notes:string}>('buyer_workspaces','true-elements')?.notes,'Do not lose this buyer conversation');
    const company=store.get<BuyerCompany>('buyer_companies','true-elements')!,muesli=before.find(p=>p.id==='true-elements-8231688601838')!,component=before.find(p=>p.id==='true-elements-7909191811310')!;
    assert.ok(ingredientPriority(muesli,company).score>ingredientPriority(component,company).score);
    for(const p of before){assert.ok(p.matches.length);assert.match(p.url,/^https:\/\//);assert.ok(!Number.isNaN(Date.parse(p.checkedAt)));}
  }finally{store.db.close();}
});
test('catalogue refresh adds reviewable products, retains failures, and recovers interrupted work',async()=>{
  const store=createStore(':memory:');seedIntelligence(store);try{
    const run=queueIngredientResearch(store,['earlyfoods','true-elements']);assert.throws(()=>queueIngredientResearch(store,['earlyfoods']),/already/);
    globalThis.fetch=async(url)=>{if(String(url).includes('true-elements'))return new Response('',{status:503});return Response.json({products:[{id:991,title:'A sourced cookie 150g',handle:'sourced-cookie',body_html:'intro<!-- split -->benefits<!-- split --><p>Flour, Jaggery (15%), Butter</p><!-- split -->recipe',images:[],variants:[{title:'150g',available:true}]}]});};
    await Promise.all([runIngredientTick(store),runIngredientTick(store)]);
    assert.equal(store.get<BuyerProduct>('buyer_products','earlyfoods-991')?.reviewStatus,'Needs review');
    assert.equal(store.get<IngredientRun>('ingredient_runs',run.id)?.completedCompanyIds.length,1);
    const original=store.get<BuyerProduct>('buyer_products','true-elements-8231688601838')!;await runIngredientTick(store);
    assert.deepEqual(store.get('buyer_products',original.id),original);const completed=store.get<IngredientRun>('ingredient_runs',run.id)!;assert.equal(completed.status,'completed');assert.match(completed.warnings[0],/503/);
    const next=queueIngredientResearch(store,['earlyfoods']);store.put('ingredient_runs',{...next,status:'running'});recoverIngredientResearch(store);assert.equal(store.get<IngredientRun>('ingredient_runs',next.id)?.status,'failed');
    assert.throws(()=>queueIngredientResearch(store,['http://127.0.0.1']),/supported/);
  }finally{globalThis.fetch=nativeFetch;store.db.close();}
});
async function fixture(readOnly=false){const store=createStore(':memory:');seed(store,catalogue);const server=createApp(store,{readOnly}).listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;return {store,request:(path:string,body?:unknown,method=body?'POST':'GET')=>nativeFetch(base+path,{method,headers:{'Content-Type':'application/json','X-Requested-With':'Grow'},...(body?{body:JSON.stringify(body)}:{})}),close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.db.close();}};}
test('research API validates buyer evidence and persists scenarios; conversion is idempotent and does not opt in contacts',async()=>{
  const s=await fixture();try{
    const initial=await (await s.request('/ingredient-intelligence?path=ingredient-intelligence')).json() as IngredientBootstrap;assert.equal(initial.products.length,33);assert.equal(initial.readOnly,false);
    const path='/ingredient-intelligence/companies/true-elements';assert.equal((await s.request(path+'/lead',{})).status,400);
    assert.equal((await s.request(path,{stage:'Qualified'},'PATCH')).status,400);
    const input={family:'Cane jaggery',monthlyPacks:10000,packGrams:700,ingredientPercent:16,yieldPercent:100,supplyShare:25,basis:'Buyer confirmed',evidence:''};
    assert.equal((await s.request('/ingredient-intelligence/scenarios/true-elements-8231688601838',input,'PUT')).status,400);
    const response=await s.request('/ingredient-intelligence/scenarios/true-elements-8231688601838',{...input,basis:'Illustration'},'PUT');assert.equal(response.status,200);assert.equal((await response.json()).monthlyPacks,10000);
    assert.equal((await s.request('/ingredient-intelligence/scenarios/true-elements-7909191811310',{...input,family:'White / baking sugar',basis:'Illustration'},'PUT')).status,400);
    assert.equal((await s.request(path,{verification:{name:'Test Professional',role:'Ingredient purchasing manager',source:'https://business.test/team',email:'buyer@business.test',confirmed:false}},'PATCH')).status,400);
    assert.equal((await s.request(path,{verification:{name:'Test Professional',role:'Ingredient purchasing manager',source:'https://business.test/team',email:'buyer@business.test',confirmed:true}},'PATCH')).status,200);
    const first=await s.request(path+'/lead',{});assert.equal(first.status,201);const lead=await first.json() as Lead;
    assert.equal(lead.segment,'Food manufacturers');assert.equal(lead.email,'buyer@business.test');assert.equal(lead.permissions,undefined);assert.equal(lead.value,0);
    const again=await (await s.request(path+'/lead',{})).json();assert.equal(again.id,lead.id);
    assert.ok(lead.products.includes('7160839766179'));assert.ok(!lead.products.includes('8899858825460'));
    assert.equal(productFitsLead(catalogue.find(p=>p.id==='8899858825460')!,lead),false);
    assert.deepEqual(scoreLead(lead,catalogue,[]).products,lead.products);
    assert.equal(buildAudience([lead],catalogue,{channel:'email',city:'',segment:'',productId:'8899858825460',limit:100}).matching,0);
  }finally{await s.close();}
});
test('manual marketplace evidence needs review and public preview blocks all research mutations',async()=>{
  const s=await fixture();try{
    const response=await s.request('/ingredient-intelligence/products',{companyId:'earlyfoods',name:'Sourced listing example',url:'https://www.amazon.in/dp/TESTSOURCE',ingredients:'Flour, jaggery 12%, butter',packGrams:100,marketplace:true});assert.equal(response.status,201);const p=await response.json();assert.equal(p.discoveredBy,'User import');assert.equal(p.reviewStatus,'Needs review');assert.equal(p.ingredientsSource,'Marketplace listing');
    assert.equal((await s.request('/ingredient-intelligence/products',{companyId:'earlyfoods',name:'Bad link',url:'javascript:alert(1)',ingredients:'Jaggery, butter, flour',packGrams:null,marketplace:false})).status,400);
  }finally{await s.close();}
  const preview=await fixture(true);try{const data=await (await preview.request('/ingredient-intelligence')).json();assert.equal(data.readOnly,true);assert.equal(data.workerEnabled,false);assert.equal(data.searchConfigured,false);for(const [path,method] of [['/search','POST'],['/research','POST'],['/companies','POST'],['/companies/true-elements','PATCH'],['/companies/true-elements/lead','POST'],['/scenarios/true-elements-8231688601838','PUT'],['/schedule','PUT'],['/products','POST'],['/products/true-elements-8231688601838/review','POST']])assert.equal((await preview.request('/ingredient-intelligence'+path,{},method)).status,503);}finally{await preview.close();}
});
test('nationwide search uses fixed provider, deduplicates sources and never turns excerpts into verified ingredients',async()=>{
  const store=createStore(':memory:');seedIntelligence(store);const key=process.env.TAVILY_API_KEY,limit=process.env.DAILY_INGREDIENT_SEARCH_LIMIT;
  try{delete process.env.TAVILY_API_KEY;const input={family:'Khandsari / khand' as const,industry:'chocolate',location:'Mumbai',marketplace:false};assert.throws(()=>queueIngredientSearch(store,input),/TAVILY/);process.env.TAVILY_API_KEY='test-only-key';process.env.DAILY_INGREDIENT_SEARCH_LIMIT='1';const job=queueIngredientSearch(store,input);let calls=0;
    globalThis.fetch=async(url,init)=>{calls++;assert.equal(url,'https://api.tavily.com/search');const payload=JSON.parse(String(init?.body));assert.equal(payload.search_depth,'basic');assert.equal(payload.include_answer,false);assert.equal(payload.country,'india');assert.match(payload.query,/Mumbai India/);return Response.json({results:[{title:'Candidate product',url:'https://brand.test/product',content:'Search excerpt: jaggery ingredients'},{title:'Duplicate',url:'https://brand.test/product',content:''},{title:'Unsafe URL',url:'javascript:alert(1)',content:''}]});};
    await Promise.all([runIngredientSearchTick(store),runIngredientSearchTick(store)]);assert.equal(calls,1);const completed=store.get<import('../shared/intelligence.js').IngredientSearch>('ingredient_searches',job.id)!;assert.equal(completed.results.length,1);assert.equal(completed.status,'completed');assert.equal(store.list('buyer_products').length,33);assert.equal(store.list('leads').length,0);
    const second=queueIngredientSearch(store,input);await runIngredientSearchTick(store);assert.equal(calls,1);assert.match(store.get<import('../shared/intelligence.js').IngredientSearch>('ingredient_searches',second.id)!.error,/limit/);
  }finally{globalThis.fetch=nativeFetch;if(key===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=key;if(limit===undefined)delete process.env.DAILY_INGREDIENT_SEARCH_LIMIT;else process.env.DAILY_INGREDIENT_SEARCH_LIMIT=limit;store.db.close();}
});
