import * as cheerio from 'cheerio';
import { z } from 'zod';
import type { BuyerCompany, BuyerProduct, IngredientEvidence, IngredientFamily } from '../shared/intelligence.js';

export const catalogueHosts:Record<string,string>={earlyfoods:'earlyfoods.com','true-elements':'true-elements.com','sweet-karam-coffee':'sweetkaramcoffee.in','the-good-kind':'thegoodkindfoods.com','the-snack-company':'www.thesnackcompany.in','slurrp-farm':'slurrpfarm.com','tots-and-moms':'totsandmoms.com'};
const tidy=(text:string)=>text.replace(/\s+/g,' ').trim();
// Only product-specific ingredient sections enter matching, never recipes, menus or related-product widgets.
export function ingredientSection(companyId:string,html:string):string {
  if(companyId==='earlyfoods'){
    const blocks=html.split(/<!--\s*split\s*-->/i);
    if(blocks.length>=3)return tidy(cheerio.load(blocks[2]).text()).split(/and nothing else|The ingredients all add up/i)[0].trim();
    return '';
  }
  const $=cheerio.load(html);$('script,style,table').remove();
  const text=tidy($.text());
  if(companyId==='slurrp-farm'&&text.length<1800&&/^(?:Cookies: )?Multigrain (?:flour|Flour)/.test(text)&&text.split(',').length>=4)return text;
  const nodes=$('h1,h2,h3,h4,h5,h6,strong,b,p');
  for(const element of nodes.toArray()){
    const node=$(element),label=tidy(node.text());
    if(!/^ingredients?\s*:?(?:\s|$)/i.test(label)||label.length>1600)continue;
    const inline=label.replace(/^ingredients?\s*:?\s*/i,'');
    if(inline.split(',').length>=3)return inline.split(/How to|Nutritional|Storage|Shelf life|Manufacturer/i)[0].trim();
    let section='';
    for(const sibling of node.nextAll().toArray()){
      const line=tidy($(sibling).text());
      if(/^(?:How to|Nutrition|Benefits|Storage|Shelf life|Manufacturer|Description|Customer)/i.test(line))break;
      section+=' '+line;if(section.length>1800)break;
    }
    if(section.split(',').length>=3)return tidy(section).slice(0,1800);
  }
  return '';
}
const patterns:{family:IngredientFamily;regex:RegExp}[]=[
  {family:'Palm jaggery',regex:/\b(?:palm jaggery|palmyra jaggery|karupatti|nolen gur|date palm jaggery)\b/gi},
  {family:'Coconut jaggery',regex:/\bcoconut jaggery(?: powder)?\b/gi},
  {family:'Cane jaggery',regex:/\b(?:jaggery(?: powder)?|gur|gud)\b/gi},
  {family:'Khandsari / khand',regex:/\b(?:khandsari(?: sugar)?|desi khand|khand(?: sugar)?)\b/gi},
  {family:'Brown sugar',regex:/\b(?:brown sugar|muscovado(?: sugar)?|demerara(?: sugar)?)\b/gi},
  {family:'White / baking sugar',regex:/\b(?:icing sugar|castor sugar|caster sugar|white sugar|organic cane sugar|sugar)\b/gi},
  {family:'Molasses',regex:/\b(?:blackstrap molasses|molasses|treacle)\b/gi},
];
export function matchIngredientText(text:string):IngredientEvidence[]{
  const matches:IngredientEvidence[]=[];const occupied:{start:number;end:number}[]=[];
  for(const pattern of patterns)for(const found of text.matchAll(new RegExp(pattern.regex))){
    const index=found.index!,term=found[0];
    if(occupied.some(o=>index>=o.start&&index<o.end))continue;
    const before=text.slice(Math.max(0,index-40),index);
    if(/\b(?:no|without|zero|free from|rather than|instead of|add|serve with)\s+(?:added\s+|refined\s+)?$/i.test(before))continue;
    if(pattern.family==='White / baking sugar'&&/\b(?:unrefined|refined|brown|khandsari|coconut|palm|date|total|added|reducing)\s*$/i.test(before))continue;
    if(pattern.family==='Cane jaggery'&&/\b(?:palm|coconut|nolen|date|palmyra)\s*$/i.test(before))continue;
    // Parentheses surrounding a percentage are not a compound ingredient. An unclosed
    // parenthesis containing a list (e.g. chocolate(cocoa, khandsari)) is a component.
    const prefix=text.slice(0,index);let depth=0;
    for(const ch of prefix){if('([{'.includes(ch))depth++;if(')]}'.includes(ch))depth=Math.max(0,depth-1);}
    const compound=depth>0;
    const percentMatch=text.slice(index+term.length).match(/^\s*\(?\s*(\d+(?:\.\d+)?)\s*%/);
    const percent=percentMatch&&Number(percentMatch[1])<=100?Number(percentMatch[1]):null;
    occupied.push({start:index,end:index+term.length});
    if(matches.some(m=>m.family===pattern.family&&m.relation===(compound?'compound':'direct')))continue;
    matches.push({family:pattern.family,term,quote:term+(percent!==null?` ${percent}%`:''),percent,relation:compound?'compound':'direct',note:compound?'This ingredient is inside another ingredient. The brand may buy a finished component; identify its manufacturer before proposing raw material.':pattern.family==='Cane jaggery'?'The label says jaggery; its cane origin and grade are not established. Confirm these before proposing Dhampur cane jaggery.':pattern.family==='White / baking sugar'?'Sugar grade and granulation are not confirmed by this general ingredient match.':'Published ingredient use supports a supplier conversation, not confirmed buying interest.'});
  }
  return matches;
}
export const shopifyProduct=z.object({id:z.number(),title:z.string(),handle:z.string(),body_html:z.string().nullable().default(''),images:z.array(z.object({src:z.string()})).default([]),variants:z.array(z.object({title:z.string(),available:z.boolean().optional()})).default([])});
export function productFromCatalogue(company:BuyerCompany,input:z.infer<typeof shopifyProduct>,checkedAt:string):BuyerProduct|null{
  if(/combo|hamper|gift|trial pack|pack of \d|\bbundle\b|\bduo\b|buy \d|get \d|monthly pocket|\bslug\b/i.test(input.title))return null;
  const ingredients=ingredientSection(company.id,input.body_html??'');if(!ingredients)return null;
  const matches=matchIngredientText(ingredients);if(!matches.length)return null;
  const packMatch=input.title.match(/\b(\d+(?:\.\d+)?)\s*(kg|g|gm|grams)\b/i);
  const packGrams=packMatch?Number(packMatch[1])*(packMatch[2].toLowerCase()==='kg'?1000:1):null;
  const imageUrl=input.images[0]?.src;let image='';
  try{const url=new URL(imageUrl);if(url.protocol==='https:'&&url.hostname==='cdn.shopify.com'){url.searchParams.set('width','520');image=url.toString();}}catch{}
  return {id:`${company.id}-${input.id}`,companyId:company.id,name:input.title,url:`${company.website.replace(/\/$/,'')}/products/${input.handle}`,image,imageSource:image,packGrams,packNote:packGrams?'Pack weight read from the product title; confirm the manufacturing unit.':'Pack weight not established. Enter it before calculating a scenario.',ingredients,ingredientsSource:'Ingredient list',matches,checkedAt,reviewStatus:'Needs review',status:input.variants.some(v=>v.available===true)?'Active listing':'Unavailable at check',discoveredBy:'Catalogue scan'};
}
export async function fetchCompanyCatalogue(company:BuyerCompany){
  const host=catalogueHosts[company.id];if(!host)throw new Error('This company has no configured catalogue connector. Add sourced product evidence manually.');
  // Fixed public hosts and redirect rejection prevent arbitrary URL / private-network fetches.
  const response=await fetch(`https://${host}/products.json?limit=250`,{redirect:'error',signal:AbortSignal.timeout(20000),headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`Official catalogue returned HTTP ${response.status}. Existing evidence has been retained.`);
  const raw=await response.text();if(raw.length>8_000_000)throw new Error('Catalogue exceeded the safe response size.');
  const parsed=z.object({products:z.array(shopifyProduct).max(250)}).parse(JSON.parse(raw));
  const checkedAt=new Date().toISOString();return {scanned:parsed.products.length,products:parsed.products.map(p=>productFromCatalogue(company,p,checkedAt)).filter((p):p is BuyerProduct=>!!p)};
}
