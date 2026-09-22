import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createStore } from '../server/db.js';
import { seed } from '../server/seed.js';
import { directorySources, parseDirectory, comparableFact } from '../server/directories.js';
import { applyPublished, matchPublished } from '../server/source-discovery.js';
import { newLead, queueDiscovery, runDiscovery } from '../server/service.js';
import { dataReport } from '../server/data-quality.js';
import { researchedBusinesses } from '../server/research.js';
import type { Lead } from '../shared/types.js';
const products=JSON.parse(readFileSync('data/catalog.json','utf8'));
const source=directorySources[0];
const fixture=(branch='Test Market',address='Shop 14, Test Market, New Delhi 110001')=>`<div class="outlet"><h3>Theobroma Bakery Store in ${branch}</h3><p>${address}</p><p>Store Timings: 9AM-11PM</p><p><a>ORDER ONLINE</a></p></div>`;

test('official-directory parsing excludes incomplete and conflicting addresses without inventing contacts',()=>{
  const records=parseDirectory(source,fixture()+'<div class="outlet"><h3>Promotion</h3><p>Buy a cake</p></div>',new Date().toISOString());
  assert.equal(records.length,1);assert.equal(records[0].phone,'');assert.equal(records[0].email,'');assert.equal(records[0].sourceUrl,source.url);assert.doesNotMatch(records[0].area,/ORDER|Timings/);
  assert.throws(()=>parseDirectory(source,fixture('A')+fixture('B'),new Date().toISOString()),/unambiguous/);
  assert.throws(()=>parseDirectory(source,'<h1>Site unavailable</h1>',new Date().toISOString()),/layout/);
  assert.equal(comparableFact('phone','0995 8894 970'),comparableFact('phone','+91 99588 94970'));
});
test('branch matching does not merge different outlets sharing a neighbourhood or phone',()=>{
  const store=createStore(':memory:');seed(store,products);
  try{const a=newLead(store,{name:'Blue Tokai — Kalka ji',brand:'Blue Tokai',city:'Delhi NCR',segment:'Cafés',area:'South Delhi',phone:'1111111111',sourceUrl:'https://bluetokaicoffee.com/pages/close-to-home'});store.saveLead(a);
    assert.equal(matchPublished({...a,id:'other',name:'Blue Tokai — AIPL Legacy'},[a]),undefined);
  }finally{store.db.close();}
});
test('refresh preserves sales history and edited contacts, flags differences and rechecks unchanged evidence',()=>{
  const store=createStore(':memory:');seed(store,products);
  try{const record=parseDirectory(source,fixture(),'2026-09-22T00:00:00.000Z')[0];const first=applyPublished(store,record);assert.equal(first.added,true);
    store.put('leads',{...first.lead,stage:'Sample sent',phone:'+91 99999 99999',notes:[{id:'note',text:'Buyer wants a sample',createdAt:'2026-09-21T00:00:00.000Z'}]});
    const refreshed=applyPublished(store,{...record,area:'Shop 15, Test Market, New Delhi 110001',phone:'+91 88888 88888',sourceAt:'2026-09-23T00:00:00.000Z'});
    assert.equal(refreshed.added,false);assert.equal(refreshed.lead.stage,'Sample sent');assert.equal(refreshed.lead.notes[0].text,'Buyer wants a sample');assert.equal(refreshed.lead.phone,'+91 99999 99999');assert.equal(refreshed.lead.area,record.area);
    assert.deepEqual(refreshed.lead.researchCheck!.changes.map(item=>item.field),['area','phone']);assert.equal(refreshed.lead.evidence!.find(item=>item.field==='name')!.checkedAt,'2026-09-23T00:00:00.000Z');
  }finally{store.db.close();}
});
test('official discovery caches successful sources for 24 hours and deduplicates repeated refreshes',async()=>{
  const original=globalThis.fetch;const store=createStore(':memory:');seed(store,products);let calls=0;
  globalThis.fetch=async()=>{calls++;return new Response(fixture('Test Market','Shop 14, Test Market, Bengaluru 560001'),{headers:{'Content-Type':'text/html'}});};
  try{const input={cities:['Bengaluru'],segments:['Bakeries' as const],mode:'live' as const,limit:500};const job=queueDiscovery(store,input);await runDiscovery(store,job);assert.equal(job.status,'completed');assert.equal(job.found,1);assert.equal(calls,1);
    const again=queueDiscovery(store,input);await runDiscovery(store,again);assert.equal(again.found,0);assert.equal(again.duplicates,1);assert.equal(calls,1);
    const report=dataReport(store);assert.equal(report.withEvidence,1);assert.equal(report.withEmail,0);assert.equal(report.total,1);
  }finally{globalThis.fetch=original;store.db.close();}
});
test('a failed source preserves existing records and remains visible as an error',async()=>{
  const original=globalThis.fetch;const store=createStore(':memory:');seed(store,products);const existing=newLead(store,{name:'Existing Cafe',city:'Bengaluru',segment:'Cafés'});store.saveLead(existing);
  globalThis.fetch=async()=>new Response('Forbidden',{status:403});
  try{const job=queueDiscovery(store,{cities:['Bengaluru'],segments:['Bakeries'],mode:'live',limit:500});await runDiscovery(store,job);assert.equal(job.status,'failed');assert.deepEqual(store.get('leads',existing.id),existing);assert.match(dataReport(store).sources.find(source=>source.id==='theobroma-bangalore')!.status!.error!,/403/);
  }finally{globalThis.fetch=original;store.db.close();}
});
test('all packaged research is sourced and has unique branch identifiers',()=>{
  assert.ok(researchedBusinesses.length>280);assert.equal(new Set(researchedBusinesses.map(record=>record.id)).size,researchedBusinesses.length);
  for(const record of researchedBusinesses){assert.ok(record.sourceUrl.startsWith('https://'));assert.ok(Date.parse(record.sourceAt));assert.ok(record.name.length>2);assert.ok(record.area.length>2);}
});
