import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { productFromCatalogue, shopifyProduct } from '../server/ingredient-research.js';
import type { BuyerCompany, BuyerProduct, SupplierMaterial } from '../shared/intelligence.js';
import type { Product } from '../shared/types.js';

// Public research only. This exporter never reads .env or the private CRM database.
type Source={id:string;name:string;host:string;category:string};
type Feed={products:unknown[];_research:{url:string;urls?:string[];checkedAt:string}};
type Contact={id:string;contactUrl:string;contactSource:string;checkedAt:string;emails:string[];phones:string[]};
const args=process.argv.slice(2),offline=args.includes('--offline'),pages=args.includes('--pages');
const only=args.find(a=>a.startsWith('--company='))?.slice('--company='.length);
const cache=resolve('.research-cache/buyer-expansion');
mkdirSync(`${cache}/pages`,{recursive:true});mkdirSync(`${cache}/contacts`,{recursive:true});
const read=<T>(path:string):T=>JSON.parse(readFileSync(path,'utf8')) as T;
const atomic=(path:string,value:unknown)=>{writeFileSync(`${path}.partial`,JSON.stringify(value,null,2)+'\n');renameSync(`${path}.partial`,path);};
const selectedIds=only?new Set(only.split(',')):null;
const sources=read<Source[]>('data/buyer-sources.json').filter(s=>!selectedIds||selectedIds.has(s.id));
if(!sources.length)throw new Error('No registered company selected.');
for(const source of sources)if(!/^[a-z0-9-]+$/.test(source.id)||!/^([a-z0-9-]+\.)+[a-z]{2,}$/i.test(source.host))throw new Error('Invalid registered public source.');
const initialCompanies=read<BuyerCompany[]>('data/buyer-companies.json'),initialProducts=read<BuyerProduct[]>('data/buyer-products.json');
const companies=new Map(initialCompanies.map(c=>[c.id,c])),products=new Map(initialProducts.map(p=>[p.id,p]));
const urls=new Set(initialProducts.map(p=>p.url.replace(/\/$/,'')));
const contacts=existsSync(`${cache}/contacts.json`)?read<Contact[]>(`${cache}/contacts.json`):[];
const report:{companyId:string;company:string;source:string;checkedAt:string;listings:number;ingredientMatches:number;added:number;retained:number;pagesRead:number;warnings:string[]}[]=[];
let networkRequests=0;
async function get(url:string,host:string){
  const target=new URL(url);if(target.protocol!=='https:'||target.hostname!==host)throw new Error('Only the registered HTTPS host is allowed.');
  networkRequests++;
  const response=await fetch(target,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json,text/html'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const declared=Number(response.headers.get('content-length')||0);if(declared>12_000_000)throw new Error('Response too large.');
  const text=await response.text();if(Buffer.byteLength(text)>12_000_000)throw new Error('Response too large.');return text;
}
async function feed(source:Source):Promise<Feed>{
  const path=`${cache}/${source.id}.json`;
  if(existsSync(path)&&(offline||Date.now()-statSync(path).mtimeMs<86400000))return read<Feed>(path);
  if(offline)throw new Error('No cached public catalogue.');
  const all:unknown[]=[],seen=new Set<number>(),urls:string[]=[];
  for(let page=1;page<=4;page++){
    const url=`https://${source.host}/products.json?limit=250&page=${page}`;
    const data=JSON.parse(await get(url,source.host)) as {products:unknown[]};
    if(!Array.isArray(data.products))throw new Error('No public product feed.');
    urls.push(url);let added=0;
    for(const raw of data.products){const item=shopifyProduct.parse(raw);if(!seen.has(item.id)){seen.add(item.id);all.push(raw);added++;}}
    if(data.products.length<250||!added)break;
  }
  const value={products:all,_research:{url:urls[0],urls,checkedAt:new Date().toISOString()}};atomic(path,value);return value;
}
function companyFor(source:Source):BuyerCompany{
  const existing=companies.get(source.id);if(existing)return existing;
  const contact=contacts.find(c=>c.id===source.id);
  const emails=(contact?.emails??[]).filter(e=>/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(e));
  const email=emails.find(e=>/^(?:info|hello|care|support|contact|customercare|orders|sales)[@.]/i.test(e))??emails[0]??'';
  return {id:source.id,name:source.name,website:`https://${source.host}`,city:'Location to confirm',state:'',locationSource:'',category:source.category,
    description:`${source.category} company with published product ingredient matches. Confirm manufacturing and raw-material purchasing responsibility.`,
    contactUrl:contact?.contactSource??`https://${source.host}`,email,phone:contact?.phones[0]??'',contactCheckedAt:contact?.checkedAt??new Date().toISOString(),
    contactNote:'Public company contact route, not a verified purchasing contact. Ask for procurement or product development. Manufacturing site, buying authority, demand and permission to send outreach remain unconfirmed.',contacts:[],
    targetRoles:['Ingredient procurement / purchase manager','Product development / R&D manager','Quality assurance / supplier approval'],
    buyingQuestions:['Do you manufacture this product yourselves, or does a contract manufacturer purchase the ingredients?','Who approves raw-material suppliers and sample trials for this product?','What ingredient grade, monthly quantity, bulk pack size and delivery location do you require?','What certifications, lab tests, price and payment terms are required for supplier approval?']};
}
let cursor=0;
async function worker(){while(cursor<sources.length){
  const source=sources[cursor++],company=companyFor(source);
  const row={companyId:source.id,company:source.name,source:`https://${source.host}/products.json?limit=250`,checkedAt:'',listings:0,ingredientMatches:0,added:0,retained:0,pagesRead:0,warnings:[] as string[]};
  try{
    const data=await feed(source);row.listings=data.products.length;row.checkedAt=data._research.checkedAt;
    let pageAttempts=0;
    if(data.products.length>=250&&(!data._research.urls||data.products.length>=1000))row.warnings.push('Catalogue pagination limit reached; additional listings may exist.');
    for(const raw of data.products){
      const parsed=shopifyProduct.safeParse(raw);if(!parsed.success){row.warnings.push('Skipped a malformed catalogue listing.');continue;}
      const item=parsed.data;
      let product=productFromCatalogue(company,item,data._research.checkedAt);
      if(!product){
        const path=`${cache}/pages/${source.id}-${item.id}.html`;
        if(!existsSync(path)&&pages&&!offline&&pageAttempts<250&&!/combo|hamper|gift|bundle|assorted|assortment|\bkit\b/i.test(item.title)){
          pageAttempts++;
          try{writeFileSync(path,await get(`https://${source.host}/products/${item.handle}`,source.host));}catch(e){row.warnings.push(`${item.handle}: ${(e as Error).message}`);}
        }
        if(existsSync(path)){row.pagesRead++;product=productFromCatalogue(company,item,statSync(path).mtime.toISOString(),readFileSync(path,'utf8'));}
      }
      if(!product)continue;
      // Raw sweetener retail listings do not establish a food manufacturing use.
      if(/^(?:organic |natural |pure |ginger |cardamom |masala )*(?:jaggery|khandsari|khand|sugar)(?: powder| cubes?| blocks?| candy)?(?:\s*[-|,\d(]|$)/i.test(product.name))continue;
      row.ingredientMatches++;
      if(products.has(product.id)||urls.has(product.url.replace(/\/$/,''))){row.retained++;continue;}
      // Explicit contradictions remain visible for review, never an approved match.
      if(/sugar[ -]free|date sweetened|no added sugar/i.test(product.name)&&product.matches.some(m=>m.family==='White / baking sugar'&&m.relation==='direct')){
        for(const match of product.matches)match.note+=' The product title and ingredient list may conflict about sweetening; check the current physical label before qualifying this match.';
        row.warnings.push(`${item.handle}: title/ingredient sweetener claims need review.`);
      }
      products.set(product.id,product);urls.add(product.url.replace(/\/$/,''));companies.set(company.id,company);row.added++;
    }
  }catch(e){row.warnings.push((e as Error).message);}
  report.push(row);console.log(`${source.name}: ${row.listings} listings, ${row.ingredientMatches} matches, ${row.added} new${row.warnings.length?`, ${row.warnings.length} source warnings`:''}`);
}}
await Promise.all(Array.from({length:offline?1:3},worker));
const finalProducts=[...products.values()],finalCompanies=[...companies.values()];
for(const p of finalProducts){if(!companies.has(p.companyId)||!p.matches.length||!p.ingredients||!p.url.startsWith('https://')||!Number.isFinite(Date.parse(p.checkedAt)))throw new Error(`Invalid product ${p.id}`);}
atomic('data/buyer-companies.json',finalCompanies);atomic('data/buyer-products.json',finalProducts);
const materials=read<SupplierMaterial[]>('data/supplier-materials.json'),catalogue=read<Product[]>('data/catalog.json');
const csvCell=(v:unknown)=>{let s=String(v??'');if(/^[=+\-@\t\r]/.test(s))s="'"+s;return '"'+s.replace(/"/g,'""')+'"';};
const columns=['Company','Industry','Location','Product','Published ingredients','Ingredient families','Direct ingredients','Component ingredients','Published percentages','Suggested Dhampur products','Review status','Availability at check','Product source','Checked at','Company website','Public contact source','Public company email','Public company phone','Procurement status'];
const lines=finalProducts.map(p=>{const c=companies.get(p.companyId)!;const supplierIds=new Set(materials.filter(m=>p.matches.some(match=>match.family===m.family)).flatMap(m=>m.productIds));return [c.name,c.category,c.city,p.name,p.ingredients,[...new Set(p.matches.map(m=>m.family))].join('; '),p.matches.filter(m=>m.relation==='direct').map(m=>m.term).join('; '),p.matches.filter(m=>m.relation==='compound').map(m=>m.term).join('; '),p.matches.filter(m=>m.percent!==null).map(m=>`${m.term}: ${m.percent}% (${m.relation})`).join('; '),catalogue.filter(item=>supplierIds.has(item.id)).map(item=>item.name).join('; '),p.reviewStatus,p.status,p.url,p.checkedAt,c.website,c.contactUrl,c.email,c.phone,'Demand, volumes and purchasing contact unconfirmed'].map(csvCell).join(',');});
writeFileSync('data/ingredient-buyers.csv',[columns.map(csvCell).join(','),...lines].join('\r\n')+'\r\n');
const families=materials.map(m=>({family:m.family,products:finalProducts.filter(p=>p.matches.some(match=>match.family===m.family)).length,companies:new Set(finalProducts.filter(p=>p.matches.some(match=>match.family===m.family)).map(p=>p.companyId)).size}));
atomic('data/ingredient-refresh-report.json',{generatedAt:new Date().toISOString(),offline,networkRequests,companiesBefore:initialCompanies.length,productsBefore:initialProducts.length,companies:finalCompanies.length,products:finalProducts.length,addedCompanies:finalCompanies.length-initialCompanies.length,addedProducts:finalProducts.length-initialProducts.length,reviewed:finalProducts.filter(p=>p.reviewStatus==='Reviewed').length,needsReview:finalProducts.filter(p=>p.reviewStatus==='Needs review').length,listingsRead:report.reduce((s,r)=>s+r.listings,0),productPagesRead:report.reduce((s,r)=>s+r.pagesRead,0),families,sources:report.sort((a,b)=>a.company.localeCompare(b.company))});
console.log(`Saved ${finalProducts.length} product profiles from ${finalCompanies.length} companies; ${finalProducts.length-initialProducts.length} added. CSV: data/ingredient-buyers.csv`);
