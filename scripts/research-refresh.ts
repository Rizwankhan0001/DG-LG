import { readFileSync, writeFileSync } from 'node:fs';
import { createStore } from '../server/db.js';
import { seed } from '../server/seed.js';
import { researchedBusinesses, seedResearch } from '../server/research.js';
import { directorySources, fetchDirectory } from '../server/directories.js';
import { applyPublished } from '../server/source-discovery.js';
import type { Lead } from '../shared/types.js';

// Rebuild the checked-in public research dataset, never export the private CRM database.
const store=createStore(':memory:');seed(store,JSON.parse(readFileSync('data/catalog.json','utf8')));seedResearch(store);
const report:{source:string;count:number;added:number;error?:string}[]=[];
for(const source of directorySources){
  try {const records=await fetchDirectory(source);let added=0;for(const record of records)if(applyPublished(store,record).added)added++;report.push({source:source.url,count:records.length,added});console.log(`${source.name}: ${records.length} published locations, ${added} new`);}
  catch(error){const message=error instanceof Error?error.message:'Source unavailable';report.push({source:source.url,count:0,added:0,error:message});console.log(`${source.name}: ${message}`);}
}
const leads=store.list<Lead>('leads').filter(lead=>!lead.demo);
if(leads.length<researchedBusinesses.length)throw new Error('Research export would lose existing records.');
const output=leads.map(({id,name,city,segment,area,website,sourceUrl,sourceAt,phone,email,contactContext,brand,directoryId,researchCheck,evidence})=>({id,name,city,segment,area,website,sourceUrl,sourceAt,phone,email,contactContext:contactContext||'',brand,directoryId,researchCheck,evidence}));
writeFileSync('data/researched-leads.json',JSON.stringify(output,null,2)+'\n');
writeFileSync('data/research-refresh-report.json',JSON.stringify({checkedAt:new Date().toISOString(),total:leads.length,sources:report},null,2)+'\n');
store.db.close();console.log(`Research dataset: ${leads.length} locations.`);
