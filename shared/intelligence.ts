import type { Product } from './types.js';
import type { DailyResearchReport } from './buyer-readiness.js';

export const ingredientFamilies=['Cane jaggery','Khandsari / khand','Palm jaggery','Coconut jaggery','Brown sugar','White / baking sugar','Molasses'] as const;
export type IngredientFamily=typeof ingredientFamilies[number];
export interface SupplierMaterial {id:string;family:IngredientFamily;productIds:string[];description:string;qualification:string[]}
export interface BuyerContact {name:string;role:string;url:string;sourceType:'Company website'|'Company announcement'|'Professional profile'|'Third-party directory'|'User verified';checkedAt:string;status:'Published professional lead'|'Buyer verified';email?:string;department?:'Procurement'|'Sales'|'Leadership'|'Operations'|'Product development';evidenceNote?:string;corroboratingUrls?:string[]}
export interface BuyerContactRoute {kind:'Email'|'Phone';value:string;purpose:string;url:string;checkedAt:string}
export interface BuyerMarketplace {platform:string;url:string;checkedAt:string;note:string}
export interface BuyerCompany {id:string;name:string;website:string;city:string;state:string;locationSource:string;category:string;description:string;contactUrl:string;email:string;phone:string;contactCheckedAt:string;contactNote:string;contacts:BuyerContact[];targetRoles:string[];buyingQuestions:string[];contactRoutes?:BuyerContactRoute[];marketplaces?:BuyerMarketplace[];researchUpdatedAt?:string}
export interface IngredientEvidence {family:IngredientFamily;term:string;quote:string;percent:number|null;relation:'direct'|'compound';note:string}
export interface BuyerProduct {id:string;companyId:string;name:string;url:string;image:string;imageSource:string;packGrams:number|null;packNote:string;ingredients:string;ingredientsSource:'Ingredient list'|'Product description'|'Marketplace listing'|'User supplied';matches:IngredientEvidence[];checkedAt:string;researchUpdatedAt?:string;sourcePublishedAt?:string;reviewStatus:'Reviewed'|'Needs review';status:'Active listing'|'Unavailable at check'|'Source unavailable'|'Availability unconfirmed';discoveredBy:'Curated research'|'Catalogue scan'|'User import'}
export interface BuyerScenario {productId:string;family:IngredientFamily;monthlyPacks:number;packGrams:number;ingredientPercent:number;yieldPercent:number;supplyShare:number;basis:'Illustration'|'Buyer confirmed';evidence:string;updatedAt?:string}
export interface BuyerWorkspace {id:string;stage:'Research'|'Find buyer'|'Contact verified'|'Sample discussion'|'Qualified'|'Not a fit';saved:boolean;notes:string;contactName:string;contactRole:string;contactSource:string;contactEmail:string;contactVerifiedAt:string;leadId?:string;scenarios:BuyerScenario[];updatedAt:string}
export interface IngredientRun {id:string;companyIds:string[];completedCompanyIds:string[];status:'queued'|'running'|'completed'|'failed';createdAt:string;finishedAt?:string;scanned:number;matched:number;added:number;updated:number;warnings:string[];progress:string}
export interface IngredientSearchInput {family:IngredientFamily;industry:string;location:string;marketplace:boolean}
export interface IngredientSearch extends IngredientSearchInput {id:string;query:string;createdAt:string;finishedAt?:string;status:'queued'|'running'|'completed'|'failed';error:string;results:{title:string;url:string;excerpt:string}[]}
export interface IngredientSchedule {id:string;enabled:boolean;companyIds:string[];nextRun:string;lastRun:string;discovery?:IngredientSearchInput|null}
export interface IngredientBootstrap {companies:BuyerCompany[];products:BuyerProduct[];catalogue:Product[];materials:SupplierMaterial[];workspaces:BuyerWorkspace[];runs:IngredientRun[];searches:IngredientSearch[];searchConfigured:boolean;schedule:IngredientSchedule;workerEnabled:boolean;coverage:{companyId:string;enabled:boolean;detail:string}[];readOnly:boolean;dailyResearch?:DailyResearchReport|null}

export function ingredientPriority(product:BuyerProduct,company:BuyerCompany,workspace?:BuyerWorkspace){
  const reasons:{label:string;points:number}[]=[];
  if(product.matches.some(m=>m.relation==='direct'))reasons.push({label:'Ingredient used directly in this product',points:40});
  else if(product.matches.length)reasons.push({label:'Ingredient appears inside a purchased component; confirm who buys it',points:15});
  if(product.ingredientsSource==='Ingredient list')reasons.push({label:'Published ingredient list',points:20});
  else if(product.ingredientsSource==='Product description')reasons.push({label:'Published product description',points:10});
  if(product.matches.some(m=>m.percent!==null))reasons.push({label:'Ingredient percentage published',points:10});
  if(product.reviewStatus==='Reviewed')reasons.push({label:'Research checked against its source',points:10});
  if(company.contactUrl)reasons.push({label:'Official company contact route',points:5});
  if(workspace?.contactVerifiedAt)reasons.push({label:'Purchasing contact verified by your team',points:15});
  const total=reasons.reduce((sum,r)=>sum+r.points,0);
  return {score:product.status==='Source unavailable'||workspace?.stage==='Not a fit'?0:Math.min(total,100),reasons};
}
export function ingredientDemand(scenario:BuyerScenario){
  const {monthlyPacks,packGrams,ingredientPercent,yieldPercent,supplyShare}=scenario;
  if(![monthlyPacks,packGrams,ingredientPercent,yieldPercent,supplyShare].every(Number.isFinite)||monthlyPacks<0||monthlyPacks>1e9||packGrams<=0||packGrams>1e7||ingredientPercent<0||ingredientPercent>100||yieldPercent<1||yieldPercent>100||supplyShare<0||supplyShare>100)throw new Error('Enter valid quantities, percentages and a yield between 1 and 100%.');
  const finishedKg=monthlyPacks*packGrams/1000;
  const ingredientKg=finishedKg*(ingredientPercent/100)/(yieldPercent/100);
  return {finishedKg,ingredientKg,addressableKg:ingredientKg*supplyShare/100};
}
export function relevantSupplierProducts(evidence:IngredientEvidence,materials:SupplierMaterial[],catalogue:Product[]){
  const ids=materials.filter(m=>m.family===evidence.family).flatMap(m=>m.productIds);
  return catalogue.filter(p=>ids.includes(p.id));
}
export function buyerBrief(company:BuyerCompany,product:BuyerProduct,workspace?:BuyerWorkspace){
  return `${company.name} — ${product.name}\nProduct source: ${product.url}\nChecked: ${product.checkedAt.slice(0,10)}\nPublished match: ${product.matches.map(m=>`${m.term}${m.percent===null?'':` (${m.percent}%)`}${m.relation==='compound'?' — inside a component':''}`).join('; ')}\nSuggested roles: ${company.targetRoles.join(', ')}\nOfficial contact route: ${company.contactUrl}\n${workspace?.contactVerifiedAt?`Buyer verified by your team: ${workspace.contactName} — ${workspace.contactRole}`:'Purchasing person and authority are not yet verified.'}\nActual monthly production and procurement volume are unknown until confirmed by the buyer. Confirm ingredient specification, recipe performance, supplier approval, bulk packs, price and MOQ.\nNext question: ${company.buyingQuestions[0]}`;
}
