import * as cheerio from 'cheerio';
import { z } from 'zod';
import type { BuyerCompany, BuyerProduct, IngredientEvidence, IngredientFamily } from '../shared/intelligence.js';

export const catalogueHosts:Record<string,string>={earlyfoods:'earlyfoods.com','true-elements':'true-elements.com','sweet-karam-coffee':'sweetkaramcoffee.in','the-good-kind':'thegoodkindfoods.com','the-snack-company':'www.thesnackcompany.in','slurrp-farm':'slurrpfarm.com','tots-and-moms':'totsandmoms.com'};
const tidy=(text:string)=>text.replace(/\s+/g,' ').trim();
const ingredientLabel=/^(?:(?:organic|product)\s+)?ingredients?(?:\s+list|\s*(?:&|and)\s*allergens)?\s*[:–-]?\s*/i;
const sectionEnd=/\b(?:how to (?:use|cook|store)|nutritional?(?: information| facts| value)?|storage|shelf life|manufacturer|allergen(?:s| information)?|packaging|delivery|specifications?|net weight|taste profile)\s*:?/i;
const listText=(text:string)=>tidy(text).replace(ingredientLabel,'').split(sectionEnd)[0].replace(/\s*Read more\s*$/i,'').trim();
const isList=(text:string)=>text.length>=8&&text.length<=2500&&/[,;•|]/.test(text)&&!/(?:\b(?:we |our |your |these |this |are made|is made|serve as|serves as|crafted with|made with |only the |natural ingredients|sweetened with|making it|perfect for|delicious|latest monthly|shop now|add to cart|read more))/i.test(text);
// Only product-specific ingredient sections enter matching, never recipes, menus or related-product widgets.
export function ingredientSection(companyId:string,html:string):string {
  if(companyId==='earlyfoods'){
    const blocks=html.split(/<!--\s*split\s*-->/i);
    if(blocks.length>=3)return tidy(cheerio.load(blocks[2]).text()).split(/and nothing else|The ingredients all add up/i)[0].trim();
  }
  // Mapro's feed explicitly separates description / ingredients / goodness.
  if(companyId==='mapro'){
    const blocks=html.split(/<!--\s*split\s*-->/i);
    if(blocks.length>=3){const $=cheerio.load(blocks[1]);const value=$('li').toArray().map(el=>tidy($(el).text())).join('; ');if(isList(value))return value;}
  }
  const $=cheerio.load(html);$('script,style,nav,header,footer,product-recommendations,[id*="judgeme"],.related-products,.product-recommendations').remove();
  // These themes link numbered tab labels to content rather than aria-controls.
  for(const tab of $('.product-tabs-title [data-tab]').toArray()){
    if(!/^ingredients?\s*$/i.test(tidy($(tab).text())))continue;
    const index=$(tab).attr('data-tab');if(!/^\d+$/.test(index??''))continue;
    const value=listText($(`.tab-content-${index}.rte`).first().text());if(isList(value))return value;
  }
  if(companyId==='millet-amma'){
    for(const label of $('p,strong,b').toArray()){
      if(!/^(?:what[’']s in (?:the |your )?.*\?|contents|ingredients)\s*:?(?:\s*)$/i.test(tidy($(label).text())))continue;
      const next=$(label).is('p')?$(label).next():$(label).parent().next();
      const copy=next.clone();copy.find('br').replaceWith('; ');
      const value=listText(copy.text());if(isList(value))return value;
    }
  }
  // Ingredient-percentage tables are distinct from nutrition panels.
  for(const table of $('table').toArray()){
    const rows=$(table).find('tr').toArray(),first=rows[0];
    if(!first||!/^ingredient\s*(?:percentage|%)$/i.test(tidy($(first).text())))continue;
    const value=rows.slice(1).map(row=>$(row).find('td').toArray().map(cell=>tidy($(cell).text())).join(' ')).join('; ');
    if(isList(value))return value;
  }
  $('table').remove();
  const text=tidy($.text());
  if(companyId==='slurrp-farm'&&text.length<1800&&/^(?:Cookies: )?Multigrain (?:flour|Flour)/.test(text)&&text.split(',').length>=4)return text;
  const nodes=$('h1,h2,h3,h4,h5,h6,strong,b,p,li,summary,button,dt,label,span,div,a');
  for(const element of nodes.toArray()){
    const node=$(element),label=tidy(node.text()).replace(/^[^\p{L}\p{N}]+/u,'');
    if(!/^(?:(?:organic|product)\s+)?ingredients?(?:\s|:|$)/i.test(label)||label.length>2500)continue;
    // Do not absorb a whole accordion containing several sections as an inline list.
    if(node.is('p,li')||!node.children().length){const inline=listText(label);if(isList(inline))return inline;}
    if(label.replace(ingredientLabel,'').trim())continue;
    const controlled=node.attr('aria-controls');
    if(controlled){const panel=$('[id]').filter((_,el)=>$(el).attr('id')===controlled).first();const value=listText(panel.text());if(isList(value))return value;}
    const details=node.closest('details');
    if(details.length){const content=details.clone();content.find('summary').remove();const value=listText(content.text());if(isList(value))return value;}
    // A label may be wrapped in a heading/container; only climb past wrappers
    // containing that label alone, never into the entire product or page.
    let heading=node;
    for(let depth=0;depth<3&&tidy(heading.parent().text())===label;depth++)heading=heading.parent();
    let section='';
    for(const sibling of heading.nextAll().toArray()){
      const next=$(sibling),line=tidy(next.text());
      if(next.is('h1,h2,h3,h4,h5,h6,hr,button,summary,details')||/^(?:How to|Nutrition|Benefits|Storage|Shelf life|Manufacturer|Description|Customer|Packaging|Delivery|Allergen|Specification)/i.test(line))break;
      section+=' '+(next.is('ul,ol')?next.find('li').toArray().map(el=>tidy($(el).text())).join('; '):line);
      const value=listText(section);if(isList(value))return value;
      if(section.length>2500)break;
    }
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
    const after=text.slice(index+term.length);
    if(/\b(?:no|without|zero|free from|rather than|instead of|add|serve with)\s+(?:(?:added|refined|processed)\s+)*$/i.test(before))continue;
    if(/^[\s-]*free\b/i.test(after))continue;
    if(pattern.family==='White / baking sugar'&&(/\b(?:unrefined|brown|khandsari|coconut|palm|date|total|added|reducing|keto|invert|fruit|alternative)\s*$/i.test(before)||/^\s+(?:syrup|alcohol|substitute|replacement)\b/i.test(after)))continue;
    if(pattern.family==='Cane jaggery'&&/\b(?:palm|coconut|nolen|date|palmyra)\s*$/i.test(before))continue;
    // Parentheses surrounding a percentage are not a compound ingredient. An unclosed
    // parenthesis containing a list (e.g. chocolate(cocoa, khandsari)) is a component.
    const prefix=text.slice(0,index);let depth=0;
    for(const ch of prefix){if('([{'.includes(ch))depth++;if(')]}'.includes(ch))depth=Math.max(0,depth-1);}
    // A labelled sub-recipe (e.g. Biscuit: sugar) can be bought in, and its
    // percentages must not become the percentage of the whole finished product.
    const compound=depth>0||/\b(?:biscuit|coating|filling|shell|base|pack\s*\d+)\s*:[^:]*$/i.test(prefix);
    const percentMatch=text.slice(index+term.length).match(/^\s*\(?\s*(\d+(?:\.\d+)?)\s*%/);
    const percent=percentMatch&&Number(percentMatch[1])<=100?Number(percentMatch[1]):null;
    occupied.push({start:index,end:index+term.length});
    if(matches.some(m=>m.family===pattern.family&&m.relation===(compound?'compound':'direct')))continue;
    matches.push({family:pattern.family,term,quote:term+(percent!==null?` ${percent}%`:''),percent,relation:compound?'compound':'direct',note:compound?'This ingredient is inside another ingredient. The brand may buy a finished component; identify its manufacturer before proposing raw material.':pattern.family==='Cane jaggery'?'The label says jaggery; its cane origin and grade are not established. Confirm these before proposing Dhampur cane jaggery.':pattern.family==='White / baking sugar'?'Sugar grade and granulation are not confirmed by this general ingredient match.':'Published ingredient use supports a supplier conversation, not confirmed buying interest.'});
  }
  return matches;
}
export const shopifyProduct=z.object({id:z.number(),title:z.string(),handle:z.string(),body_html:z.string().nullable().default(''),images:z.array(z.object({src:z.string()})).default([]),variants:z.array(z.object({title:z.string(),available:z.boolean().optional()})).default([])});
export function productFromCatalogue(company:BuyerCompany,input:z.infer<typeof shopifyProduct>,checkedAt:string,ingredientHtml?:string):BuyerProduct|null{
  if(/combo|hamper|gift|trial pack|pack of \d|\bbundle\b|\bduo\b|buy \d|get \d|monthly pocket|\bslug\b|assorted|assortment|\bselection\b|\bfreebie\b|\bkit\b|diwali|rakhi|celebration|indulgence box|\s\+\s/i.test(input.title))return null;
  const ingredients=ingredientSection(company.id,ingredientHtml??input.body_html??'');if(!ingredients)return null;
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
