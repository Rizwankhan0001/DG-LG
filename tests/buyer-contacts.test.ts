import test from 'node:test';
import assert from 'node:assert/strict';
import { contactApproach, sortBuyerContacts, sortBuyerCompanies, companyEvidenceDate } from '../shared/buyer-contacts.js';
import type { BuyerCompany, BuyerContact, BuyerProduct } from '../shared/intelligence.js';

const person=(name:string,department:BuyerContact['department'],role=name,checkedAt='2026-09-20T00:00:00Z',sourceType:BuyerContact['sourceType']='Company website'):BuyerContact=>({name,role,department,checkedAt,sourceType,url:'https://example.test/team',status:'Published professional lead'});
const company=(id:string,name:string,contacts:BuyerContact[]=[],contactCheckedAt=''):BuyerCompany=>({id,name,contacts,contactCheckedAt,website:'https://example.test',contactUrl:'https://example.test/contact',city:'',state:'',locationSource:'',category:'',description:'',email:'',phone:'',contactNote:'',targetRoles:[],buyingQuestions:[]});
const product=(id:string,checkedAt=''):BuyerProduct=>({id,companyId:id,name:id,checkedAt,url:'https://example.test/product',image:'',imageSource:'',ingredients:'Jaggery',ingredientsSource:'Ingredient list',packGrams:null,packNote:'',matches:[],reviewStatus:'Needs review',status:'Active listing',discoveredBy:'Curated research'});

test('contact sorting prioritizes purchasing and R&D, preserves evidence status and does not mutate research',()=>{
  const contacts=[person('CEO','Leadership'),person('Sales','Sales'),person('R&D','Product development'),person('Buyer','Procurement')];
  assert.deepEqual(sortBuyerContacts(contacts).map(p=>p.name),['Buyer','R&D','Sales','CEO']);
  assert.equal(contacts[0].name,'CEO');
  assert.ok(sortBuyerContacts(contacts).every(p=>p.status==='Published professional lead'));
  assert.match(contactApproach(contacts[1]),/introduction.*purchasing team/);
  assert.match(contactApproach(contacts[0]),/Confirm the current role first/);
});
test('people sort by title, name, source check date and source type with deterministic ties',()=>{
  const contacts=[person('Zed','Procurement','Buyer','invalid','Professional profile'),person('Amy','Sales','Sales manager','2026-09-29T00:00:00Z'),person('Ben','Leadership','CEO','2026-09-30T00:00:00Z','Third-party directory')];
  assert.deepEqual(sortBuyerContacts(contacts,'title').map(p=>p.name),['Zed','Ben','Amy']);
  assert.deepEqual(sortBuyerContacts(contacts,'name').map(p=>p.name),['Amy','Ben','Zed']);
  assert.deepEqual(sortBuyerContacts(contacts,'newest').map(p=>p.name),['Ben','Amy','Zed']);
  assert.deepEqual(sortBuyerContacts(contacts,'source').map(p=>p.name),['Amy','Zed','Ben']);
});
test('company sorting uses matched products and evidence dates, without treating an import timestamp as verification',()=>{
  const a=company('a','Alpha',[person('CEO','Leadership')]);
  const b={...company('b','Beta',[person('Buyer','Procurement')]),researchUpdatedAt:'2099-01-01T00:00:00Z'};
  const c=company('c','Gamma');
  const map=new Map([a,b,c].map(c=>[c.id,c]));
  const entries:[string,BuyerProduct[]][]=[['b',[product('b')]],['c',[product('c')]],['a',[product('a','2026-09-30T00:00:00Z'),product('a2')]]];
  assert.deepEqual(sortBuyerCompanies(entries,map,'priority').map(([id])=>id),['b','c','a']);
  assert.deepEqual(sortBuyerCompanies(entries,map,'name').map(([id])=>id),['a','b','c']);
  assert.deepEqual(sortBuyerCompanies(entries,map,'procurement').map(([id])=>id),['b','a','c']);
  assert.deepEqual(sortBuyerCompanies(entries,map,'products').map(([id])=>id),['a','b','c']);
  assert.deepEqual(sortBuyerCompanies(entries,map,'newest').map(([id])=>id),['a','b','c']);
  assert.deepEqual(sortBuyerCompanies(entries,map,'oldest').map(([id])=>id),['b','a','c']);
  assert.equal(companyEvidenceDate(b,[]),Date.parse('2026-09-20T00:00:00Z'));
  assert.deepEqual(entries.map(([id])=>id),['b','c','a']);
});
