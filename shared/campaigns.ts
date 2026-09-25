import type { Lead, Product, Segment } from './types.js';
import { productFitsLead, productTitle } from './catalogue.js';

export type Channel = 'email'|'whatsapp';
export interface AudienceFilters { channel:Channel; city:string; segment:string; productId:string; limit:number }
export interface Candidate { leadId:string; name:string; city:string; segment:Segment; address:string; priority:number; reasons:string[]; products:string[]; ready:boolean; blocked:string }
export interface Audience { candidates:Candidate[]; selected:Candidate[]; matching:number; contactable:number; ready:number; duplicates:number; requested:number }
export interface Campaign { id:string; name:string; channel:Channel; filters:AudienceFilters; subject:string; body:string; status:'draft'|'queued'|'running'|'paused'|'completed'|'cancelled'; createdAt:string; reviewedAt?:string; nextRunAt?:string; note:string; template?:{name:string;language:string;body:string}; email?:{from:string;replyTo:string;postalAddress:string;company:string;appUrl:string} }
export interface Recipient { id:string; campaignId:string; leadId:string; name:string; address:string; priority:number; reasons:string[]; subject:string; body:string; parameters?:string[]; status:'pending'|'sending'|'accepted'|'failed'|'uncertain'|'skipped'; error?:string; providerId?:string; attemptedAt?:string; finishedAt?:string; payload?:Record<string,unknown> }
export interface CampaignDetail { campaign:Campaign; recipients:Recipient[] }
export interface CampaignConfig { email:{ready:boolean;missing:string[];limit:number;used:number}; whatsapp:{ready:boolean;missing:string[];limit:number;used:number;template?:{name:string;language:string;body:string}}; worker:boolean }
export const defaultSubject='A product trial for {{business}}';
export const defaultBody='Hello {{business}} team,\n\nWe are reaching out from Dhampur Green. For a {{category}} business in {{city}}, {{products}} could be relevant to your service.\n\nWould you be open to discussing your current ingredients and a small product trial? We can confirm suitable packs, trade pricing and quantities after understanding your needs.\n\n{{sender}}\n{{company}}';
export function destination(lead:Pick<Lead,'email'|'phone'>,channel:Channel):string {
  if(channel==='email'){const email=lead.email.trim().toLowerCase();return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&!/@(?:.*\.)?example\.(?:com|org|net)$|\.example$/.test(email)?email:'';}
  const raw=lead.phone.trim();let phone=raw.replace(/[\s().-]/g,'');
  if(/^[6-9]\d{9}$/.test(phone))phone='+91'+phone;
  if(/^91[6-9]\d{9}$/.test(phone))phone='+'+phone;
  return /^\+[1-9]\d{7,14}$/.test(phone)?phone:'';
}
export function permissionProblem(lead:Lead,channel:Channel):string {
  if(lead.demo)return 'Sample business — cannot send';
  if(lead.suppressed)return 'Do not contact';
  if(['Won','Lost'].includes(lead.stage))return 'Closed sales opportunity';
  const last=[...(lead.contactHistory??[])].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  if(last?.outcome==='Not interested')return 'Latest conversation: not interested';
  const address=destination(lead,channel);if(!address)return channel==='email'?'Needs a valid business email':'Needs a WhatsApp number with country code';
  const permission=lead.permissions?.[channel];
  if(permission?.status!=='granted'||permission.address!==address)return `Needs ${channel==='email'?'email':'WhatsApp'} opt-in`;
  return '';
}
export function buildAudience(leads:Lead[],products:Product[],filters:AudienceFilters,blocked:(lead:Lead,address:string)=>string=()=>'',now=Date.now()):Audience {
  const candidates:Candidate[]=leads.filter(lead=>!lead.demo&&(!filters.city||lead.city===filters.city)&&(!filters.segment||lead.segment===filters.segment)&&(!filters.productId||products.some(p=>p.id===filters.productId&&productFitsLead(p,lead)))).map(lead=>{
    const fits=products.filter(p=>productFitsLead(p,lead)&&(!filters.productId||p.id===filters.productId));
    let priority=0;const reasons:string[]=[];
    if(fits.length){priority+=30;reasons.push('Catalogue matches this buyer category (+30)');}
    const last=[...(lead.contactHistory??[])].sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
    if(last&&Date.parse(last.createdAt)<=now&&now-Date.parse(last.createdAt)<=90*86400000&&['Interested','Sample requested'].includes(last.outcome)){priority+=35;reasons.push(`Buyer reported ${last.outcome.toLowerCase()} in the last 90 days (+35)`);}
    if(['Qualified','Sample sent','Negotiation'].includes(lead.stage)){priority+=15;reasons.push(`Sales stage: ${lead.stage} (+15)`);}
    if(lead.saved){priority+=5;reasons.push('Saved to your shortlist (+5)');}
    if(lead.evidence?.some(e=>Date.parse(e.checkedAt)<=now&&now-Date.parse(e.checkedAt)<=90*86400000)){priority+=10;reasons.push('Source evidence checked in the last 90 days (+10)');}
    const address=destination(lead,filters.channel);if(address){priority+=5;reasons.push('A usable contact is recorded (+5)');}
    const problem=permissionProblem(lead,filters.channel)||blocked(lead,address)||(fits.length?'':'No matching catalogue products');
    return {leadId:lead.id,name:lead.name,city:lead.city,segment:lead.segment,address,priority,reasons,products:fits.slice(0,2).map(productTitle),ready:!problem,blocked:problem};
  }).sort((a,b)=>b.priority-a.priority||a.name.localeCompare(b.name)||a.leadId.localeCompare(b.leadId));
  // An eligible record wins over an unapproved branch sharing the same central inbox.
  const chosen=new Map<string,Candidate>();
  for(const item of candidates){if(!item.address)continue;const prev=chosen.get(item.address);if(!prev||(!prev.ready&&item.ready))chosen.set(item.address,item);}
  let duplicates=0;
  for(const item of candidates)if(item.address&&chosen.get(item.address)!==item){item.ready=false;item.blocked='Shared contact — another branch represents this address';duplicates++;}
  const ready=candidates.filter(item=>item.ready);
  return {candidates,selected:ready.slice(0,filters.limit),matching:candidates.length,contactable:chosen.size,ready:ready.length,duplicates,requested:filters.limit};
}
export function personalise(template:string,candidate:Candidate,company:string,sender:string):string {
  const labels:Record<Segment,string>={'Cafés':'café','Restaurants':'restaurant','Hotels & resorts':'hotel or resort','Bakeries':'bakery','Bars & lounges':'bar or lounge','Caterers':'catering','Sweet shops':'sweet shop','Distributors':'distribution'};
  const values:Record<string,string>={business:candidate.name,city:candidate.city,category:labels[candidate.segment],products:candidate.products.join(' and ')||'our hospitality range',company,sender};
  return template.replace(/{{\s*(\w+)\s*}}/g,(_,key:string)=>{if(!(key in values))throw new Error(`Unknown message field: ${key}`);return values[key];});
}
