import type { DemandPlan, Lead, Product, Segment } from './types.js';

// These are illustrative planning inputs, not market benchmarks or buyer facts.
export interface UseCase {
  id: string; title: string; why: string; productIds: string[];
  activity: string; portionUnit: 'sachets'|'g'|'ml'; resultUnit: 'sachets'|'kg'|'litres';
  low: number; high: number; portion: number; question: string;
}
const sachets:UseCase={id:'sachets',title:'Tea & coffee service',why:'Portioned sugar and jaggery sachets could support table service, takeaway drinks or a self-service beverage counter.',productIds:['7161040896163','6613008318627','6613008154787','9148457943284'],activity:'Eligible drinks per day',portionUnit:'sachets',resultUnit:'sachets',low:60,high:100,portion:1,question:'How many drinks need sweetener each day, and do you prefer white sugar, brown sugar or jaggery?'};
const baking:UseCase={id:'baking',title:'Baking & finishing',why:'Castor sugar could be trialled in baking; icing sugar in finishing; muscovado in recipes that need a darker flavour. Each recipe needs its own test.',productIds:['6613007106211','6613007138979','6613007368355'],activity:'Eligible batches per day',portionUnit:'g',resultUnit:'kg',low:3,high:6,portion:500,question:'Do you bake here or in a central kitchen? What sugar and how many grams does one batch use?'};
const drinks:UseCase={id:'drink-mixes',title:'Mixed drinks & mocktails',why:'Mojito or blue curaçao syrup could be trialled in selected drinks for a measured, repeatable preparation.',productIds:['8155281162484','8062445027572'],activity:'Eligible mixed drinks per day',portionUnit:'ml',resultUnit:'litres',low:15,high:30,portion:20,question:'Which drinks could use a ready-made mix, how many sell daily, and what is the recipe dose?'};
const desserts:UseCase={id:'jaggery',title:'Jaggery-based recipes',why:'Jaggery powder could be tested in desserts or Indian recipes where its flavour suits the menu. Confirm the recipe before proposing a replacement.',productIds:['7160839766179'],activity:'Eligible batches per day',portionUnit:'g',resultUnit:'kg',low:2,high:4,portion:500,question:'Which recipes use jaggery, what is the monthly purchase, and who approves ingredient trials?'};
const finish:UseCase={id:'after-meal',title:'An after-meal sweet touch',why:'Gur saunf sachets could be offered after meals or included with catered service if the buyer wants an individually packed mouth freshener.',productIds:['8294713950452'],activity:'Eligible diners per service day',portionUnit:'sachets',resultUnit:'sachets',low:60,high:120,portion:1,question:'Do you offer a mouth freshener, how many diners receive one, and what pack size fits your budget?'};
const toppings:UseCase={id:'toppings',title:'Breakfast & plated desserts',why:'Pancake syrup could be trialled with breakfast dishes or plated desserts where the menu and chef’s recipe call for a sweet topping.',productIds:['7815592476916'],activity:'Eligible plates per day',portionUnit:'ml',resultUnit:'litres',low:10,high:20,portion:15,question:'Are pancakes or suitable desserts on the current menu, and what quantity of topping is used per plate?'};
const distribution:UseCase={...desserts,id:'distribution',title:'Resale to hospitality buyers',why:'A distributor could stock jaggery for local hospitality accounts after confirming customer demand, trade pricing and delivery terms.',activity:'Customer orders per working day',low:1,high:3,portion:5000,question:'Which accounts already buy jaggery, what is their monthly volume, and what margin and credit terms are needed?'};
const cases:Record<Segment,UseCase[]>={
  'Cafés':[sachets,toppings], 'Restaurants':[desserts,finish,drinks],
  'Hotels & resorts':[sachets,baking,drinks,toppings], 'Bakeries':[baking,desserts],
  'Bars & lounges':[drinks], 'Caterers':[finish,sachets,drinks],
  'Sweet shops':[desserts,baking], 'Distributors':[distribution],
};
export function useCases(segment:Segment,products?:Product[]) {
  return cases[segment].filter(c=>!products||c.productIds.some(id=>products.some(p=>p.id===id)));
}
export function defaultPlan(segment:Segment,id?:string):DemandPlan {
  const c=cases[segment].find(c=>c.id===id)??cases[segment][0];
  return {useCaseId:c.id,dailyLow:c.low,dailyHigh:c.high,days:segment==='Caterers'?8:30,portion:c.portion,supplyShare:100,notes:''};
}
export function calculateDemand(segment:Segment,plan:DemandPlan) {
  const c=cases[segment].find(c=>c.id===plan.useCaseId);
  if(!c)throw new Error('Choose a product use that matches this buyer category.');
  const factor=plan.days*plan.portion*(plan.supplyShare/100)/(c.portionUnit==='sachets'?1:1000);
  return {low:plan.dailyLow*factor,high:plan.dailyHigh*factor,unit:c.resultUnit,useCase:c};
}
export const quantity=(n:number)=>new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(n);
export function demandRange(segment:Segment,plan:DemandPlan) {
  const result=calculateDemand(segment,plan);
  return `${quantity(result.low)}–${quantity(result.high)} ${result.unit}/month`;
}
export function buyingRoute(lead:Pick<Lead,'segment'|'brand'>) {
  const roles:Record<Segment,string>={'Cafés':'Café manager or beverage purchasing team','Restaurants':'Executive chef or purchase manager','Hotels & resorts':'F&B manager and procurement team','Bakeries':'Head baker or central production purchasing team','Bars & lounges':'Bar manager or beverage purchase manager','Caterers':'Catering operations or purchase manager','Sweet shops':'Production owner or purchase manager','Distributors':'Business owner or category buyer'};
  return {role:roles[lead.segment],note:lead.brand?`${lead.brand} may buy centrally. Ask whether this branch can approve a trial or must refer you to the brand’s purchasing team.`:'Ask whether purchasing happens at this location or through a central office.'};
}
