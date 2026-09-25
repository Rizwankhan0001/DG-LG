import { randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './db.js';
import type { Lead, Product, Draft } from '../shared/types.js';
import { buildAudience, destination, permissionProblem, personalise, type AudienceFilters, type Campaign, type CampaignConfig, type Channel, type Recipient } from '../shared/campaigns.js';

const now=()=>new Date().toISOString();
const fail=(message:string)=>{throw new Error(message);};
export const campaignFilters=z.object({channel:z.enum(['email','whatsapp']),city:z.string().max(50).default(''),segment:z.string().max(50).default(''),productId:z.string().max(100).default(''),limit:z.number().int().min(1).max(500)}).strict();
const limitFor=(channel:Channel)=>{const value=Number(process.env[channel==='email'?'DAILY_EMAIL_LIMIT':'DAILY_WHATSAPP_LIMIT']??30);return Number.isInteger(value)&&value>=0?value:30;};
const graph=()=>`https://graph.facebook.com/${process.env.WHATSAPP_API_VERSION}`;
const emailIdentity=(store:Store)=>({from:process.env.OUTREACH_FROM??'',replyTo:process.env.OUTREACH_REPLY_TO??'',postalAddress:process.env.OUTREACH_POSTAL_ADDRESS??'',company:store.settings().company,appUrl:process.env.APP_URL??''});
export function campaignConfig(store:Store):CampaignConfig {
  const used=(kind:string)=>(store.db.prepare('SELECT count FROM usage WHERE day=? AND kind=?').get(now().slice(0,10),kind) as {count:number}|undefined)?.count??0;
  const missing=(keys:string[])=>keys.filter(key=>!process.env[key]);
  const email=missing(['RESEND_API_KEY','OUTREACH_FROM','OUTREACH_POSTAL_ADDRESS','APP_URL']);
  if(process.env.OUTREACH_ENABLED!=='true')email.push('OUTREACH_ENABLED=true');
  if(!process.env.APP_URL?.startsWith('https://'))email.push('Public HTTPS APP_URL for unsubscribe');
  const whatsapp=missing(['WHATSAPP_ACCESS_TOKEN','WHATSAPP_PHONE_NUMBER_ID','WHATSAPP_API_VERSION','WHATSAPP_TEMPLATE_ID','WHATSAPP_APP_SECRET','WHATSAPP_VERIFY_TOKEN']);
  if(process.env.WHATSAPP_ENABLED!=='true')whatsapp.push('WHATSAPP_ENABLED=true');
  if(!/^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION??''))whatsapp.push('Valid WHATSAPP_API_VERSION');
  if(!/^\d+$/.test(process.env.WHATSAPP_PHONE_NUMBER_ID??''))whatsapp.push('Valid WHATSAPP_PHONE_NUMBER_ID');
  const template=store.get<NonNullable<Campaign['template']>&{id:string;sourceId:string}>('campaign_templates','approved');
  const verified=template?.sourceId===process.env.WHATSAPP_TEMPLATE_ID?template:undefined;
  if(!verified)whatsapp.push('Load an approved WhatsApp template');
  const worker=process.env.WORKER_ENABLED!=='false';
  return {worker,email:{ready:!email.length&&worker,missing:email,limit:limitFor('email'),used:used('email_attempts')},whatsapp:{ready:!whatsapp.length&&worker,missing:whatsapp,limit:limitFor('whatsapp'),used:used('whatsapp_attempts'),template:verified?{name:verified.name,language:verified.language,body:verified.body}:undefined}};
}
export function campaignBlock(store:Store,lead:Lead,channel:Channel,address:string,excludeId?:string,excludeDraftId?:string):string {
  if(channel==='email'&&store.db.prepare('SELECT email FROM suppressions WHERE email=?').get(address))return 'Unsubscribed from email';
  if(store.get('channel_suppressions',`${channel}:${address}`))return 'Contact opted out';
  const recent=Date.now()-7*86400000;
  const recipients=store.list<Recipient>('campaign_recipients');
  if(recipients.some(r=>r.id!==excludeId&&r.address===address&&['sending','accepted','uncertain'].includes(r.status)&&(!r.attemptedAt||Date.parse(r.attemptedAt)>recent)))return 'Already contacted or awaiting a send result in the last 7 days';
  if(channel==='email'&&store.list<Draft>('drafts').some(d=>d.id!==excludeDraftId&&d.email.toLowerCase()===address&&(d.status==='sending'||(d.status==='sent'&&Date.parse(d.sentAt??d.createdAt)>recent)||(d.status==='failed'&&d.delivery&&Date.parse(d.delivery.startedAt)>recent))))return 'Already contacted or awaiting a result through Outreach in the last 7 days';
  return '';
}
export function campaignAudience(store:Store,filters:AudienceFilters){return buildAudience(store.list<Lead>('leads'),store.list<Product>('products'),filters,(lead,address)=>campaignBlock(store,lead,filters.channel,address));}
export async function loadWhatsAppTemplate(store:Store){
  if(!process.env.WHATSAPP_ACCESS_TOKEN||!/^\d+$/.test(process.env.WHATSAPP_TEMPLATE_ID??'')||!/^v\d+\.\d+$/.test(process.env.WHATSAPP_API_VERSION??''))fail('Set the WhatsApp access token, template ID and API version on the server first.');
  const response=await fetch(`${graph()}/${process.env.WHATSAPP_TEMPLATE_ID}?fields=name,language,status,components`,{headers:{Authorization:`Bearer ${process.env.WHATSAPP_ACCESS_TOKEN}`},signal:AbortSignal.timeout(20000)});
  if(!response.ok)fail(`Meta could not load the template (HTTP ${response.status}). Check your template ID and token permissions.`);
  const item=z.object({name:z.string(),language:z.string(),status:z.literal('APPROVED'),components:z.array(z.object({type:z.enum(['BODY','FOOTER']),text:z.string().max(6000)}))}).parse(await response.json());
  const body=item.components.find(c=>c.type==='BODY')?.text;if(!body)fail('Choose an approved text-only body template.');
  const placeholders=[...body!.matchAll(/{{(.*?)}}/g)].map(m=>m[1]);
  if(placeholders.some(p=>!['1','2'].includes(p))||(placeholders.includes('2')&&!placeholders.includes('1')))fail('Supported WhatsApp variables: {{1}} = business, {{2}} = matched products. Use a body-only template with optional static footer.');
  const footer=item.components.find(c=>c.type==='FOOTER')?.text??'';
  if(footer.includes('{{'))fail('The template footer must be static.');
  if(!/\bstop\b/i.test(body!+' '+footer))fail('Include an instruction to reply STOP in the approved template.');
  return store.put('campaign_templates',{id:'approved',sourceId:process.env.WHATSAPP_TEMPLATE_ID!,name:item.name,language:item.language,body:body!+(footer?'\n\n'+footer:''),checkedAt:now()});
}
export function createCampaign(store:Store,input:{name:string;filters:AudienceFilters;subject:string;body:string;leadIds:string[];requestId:string}) {
  const existing=store.get<Campaign>('campaigns',input.requestId);
  if(existing)return detail(store,existing.id);
  const audience=campaignAudience(store,input.filters);
  const eligible=audience.selected.filter(c=>input.leadIds.includes(c.leadId));
  if(!eligible.length||eligible.length!==new Set(input.leadIds).size)fail('Some selected contacts are no longer eligible. Refresh the audience and review again.');
  const template=campaignConfig(store).whatsapp.template;
  if(input.filters.channel==='whatsapp'&&!template)fail('Load an approved WhatsApp template first.');
  const settings=store.settings();
  const campaign:Campaign={id:input.requestId,name:input.name,channel:input.filters.channel,filters:input.filters,subject:input.subject,body:input.body,status:'draft',createdAt:now(),note:'Review the saved recipients and messages before starting.',...(input.filters.channel==='whatsapp'?{template}:{email:emailIdentity(store)})};
  const recipients:Recipient[]=eligible.map(c=>{
    const parameters=template?.body.includes('{{1}}')?[c.name,...(template.body.includes('{{2}}')?[c.products.join(' and ')]:[])]:[];
    return {id:randomUUID(),campaignId:campaign.id,leadId:c.leadId,name:c.name,address:c.address,priority:c.priority,reasons:c.reasons,subject:personalise(input.subject,c,settings.company,settings.senderName),body:campaign.channel==='email'?personalise(input.body,c,settings.company,settings.senderName):template!.body.replace(/{{([12])}}/g,(_,n:string)=>parameters[Number(n)-1]),parameters,status:'pending'};
  });
  store.db.transaction(()=>{store.put('campaigns',campaign);recipients.forEach(r=>store.put('campaign_recipients',r));})();
  store.activity(`Campaign “${campaign.name}” prepared with ${recipients.length} unique ${campaign.channel} contacts.`,false,'outreach');
  return {campaign,recipients};
}
export function detail(store:Store,id:string){const campaign=store.get<Campaign>('campaigns',id);if(!campaign)fail('Campaign not found.');return {campaign:campaign!,recipients:store.list<Recipient>('campaign_recipients').filter(r=>r.campaignId===id)};}
export function controlCampaign(store:Store,id:string,action:'start'|'pause'|'cancel',reviewed=false){
  const {campaign,recipients}=detail(store,id);
  if(action==='start'){
    if(['queued','running'].includes(campaign.status))return campaign;
    if(!['draft','paused'].includes(campaign.status)||!recipients.some(r=>r.status==='pending'))fail('This campaign has no pending recipients to start.');
    if(!reviewed)fail('Review the saved audience and personalised messages before starting.');
    const config=campaignConfig(store);if(!config[campaign.channel].ready)fail(`Sending is not ready: ${[...config[campaign.channel].missing,...(!config.worker?['Enable the persistent worker']:[])].join(', ')}`);
    if(campaign.channel==='whatsapp'&&JSON.stringify(campaign.template)!==JSON.stringify(config.whatsapp.template))fail('The WhatsApp template changed. Create and review a new campaign.');
    if(campaign.channel==='email'&&JSON.stringify(campaign.email)!==JSON.stringify(emailIdentity(store)))fail('Sender details changed after this draft was saved. Create a new campaign to review the updated sender and footer.');
    return store.put('campaigns',{...campaign,status:'queued' as const,reviewedAt:now(),nextRunAt:undefined,note:'Queued. Contacts and opt-outs are checked again before every send.'});
  }
  if(['cancelled','completed'].includes(campaign.status))return campaign;
  if(action==='cancel')store.db.transaction(()=>{for(const r of recipients.filter(r=>r.status==='pending'))store.put('campaign_recipients',{...r,status:'skipped',error:'Campaign cancelled.',finishedAt:now()});})();
  return store.put('campaigns',{...campaign,status:action==='pause'?'paused' as const:'cancelled' as const,note:action==='pause'?'Paused. A request already in progress may still finish.':'Cancelled. A request already in progress may still finish.'});
}
export function recoverCampaigns(store:Store){
  for(const r of store.list<Recipient>('campaign_recipients').filter(r=>r.status==='sending')){
    store.put('campaign_recipients',{...r,status:'uncertain',error:'Server restarted during sending. Check the provider dashboard; this contact will not be retried automatically.',finishedAt:now()});
    const c=store.get<Campaign>('campaigns',r.campaignId);if(c&&['queued','running'].includes(c.status))store.put('campaigns',{...c,status:'paused',note:'A send result is uncertain. Check your provider dashboard before continuing.'});
  }
}
export async function runCampaignTick(store:Store) {
  // This transaction claims one recipient before network I/O. Run one persistent worker per database.
  const claimed=store.db.transaction(()=>{
    const campaign=store.list<Campaign>('campaigns').filter(c=>['queued','running'].includes(c.status)&&(!c.nextRunAt||Date.parse(c.nextRunAt)<=Date.now())).sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0];
    if(!campaign)return null;
    const recipients=store.list<Recipient>('campaign_recipients').filter(r=>r.campaignId===campaign.id);
    if(recipients.some(r=>r.status==='sending'))return null;
    const recipient=recipients.find(r=>r.status==='pending');
    if(!recipient){store.put('campaigns',{...campaign,status:'completed',note:'Queue finished. Accepted means the provider received the request, not that the buyer received or read it.'});return null;}
    const config=campaignConfig(store);
    if(!config[campaign.channel].ready){store.put('campaigns',{...campaign,status:'paused',note:'Sender configuration or worker settings changed. Check setup before resuming.'});return null;}
    const lead=store.get<Lead>('leads',recipient.leadId);
    const problem=!lead?'Lead no longer exists':permissionProblem(lead,campaign.channel)||(destination(lead,campaign.channel)!==recipient.address?'Contact changed after review':campaignBlock(store,lead,campaign.channel,recipient.address,recipient.id));
    if(problem){store.put('campaign_recipients',{...recipient,status:'skipped',error:problem,finishedAt:now()});return null;}
    if(!store.reserveUsage(campaign.channel==='email'?'email_attempts':'whatsapp_attempts',limitFor(campaign.channel))){
      const next=new Date();next.setUTCHours(24,0,0,0);store.put('campaigns',{...campaign,status:'queued',nextRunAt:next.toISOString(),note:'Daily sending limit reached. Remaining contacts resume after 05:30 IST.'});return null;
    }
    let payload:Record<string,unknown>;
    if(campaign.channel==='email'){
      const token=randomBytes(32).toString('hex');store.db.prepare('INSERT INTO unsubscribe_tokens VALUES(?,?)').run(token,recipient.address);
      const sender=campaign.email!;
      const unsubscribe=`${sender.appUrl.replace(/\/$/,'')}/api/unsubscribe?token=${token}`;
      payload={from:sender.from,to:[recipient.address],subject:recipient.subject,text:`${recipient.body}\n\n${sender.company}\n${sender.postalAddress}\nYou are receiving this because you opted in to product updates from ${sender.company}.\nUnsubscribe: ${unsubscribe}`,...(sender.replyTo?{reply_to:sender.replyTo}:{})};
    }else payload={messaging_product:'whatsapp',to:recipient.address.replace(/^\+/,''),type:'template',template:{name:campaign.template!.name,language:{code:campaign.template!.language},...((recipient.parameters??[]).length?{components:[{type:'body',parameters:recipient.parameters!.map(text=>({type:'text',text}))}]}:{})}};
    const sending=store.put('campaign_recipients',{...recipient,status:'sending' as const,attemptedAt:now(),payload});
    store.put('campaigns',{...campaign,status:'running',nextRunAt:undefined,note:'Sending the reviewed batch, one contact at a time.'});return {campaign,recipient:sending};
  })();
  if(!claimed)return;
  const {campaign,recipient}=claimed;
  let result:Recipient;let pause=false;
  try{
    const response=await fetch(campaign.channel==='email'?'https://api.resend.com/emails':`${graph()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${campaign.channel==='email'?process.env.RESEND_API_KEY:process.env.WHATSAPP_ACCESS_TOKEN}`,...(campaign.channel==='email'?{'Idempotency-Key':`grow-campaign-${recipient.id}`}:{})},body:JSON.stringify(recipient.payload),signal:AbortSignal.timeout(25000)});
    if(!response.ok){pause=true;result={...recipient,status:response.status>=500?'uncertain':'failed',error:`Provider returned HTTP ${response.status}. Check the provider dashboard before resuming. This recipient will not be retried automatically.`,finishedAt:now()};}
    else {const data=await response.json() as {id?:string;messages?:{id:string}[]};const id=campaign.channel==='email'?data.id:data.messages?.[0]?.id;if(!id)throw new Error('Missing provider receipt');result={...recipient,status:'accepted',providerId:id,finishedAt:now()};}
  }catch {pause=true;result={...recipient,status:'uncertain',error:'No reliable provider receipt. Check the provider dashboard; no automatic retry will occur.',finishedAt:now()};}
  store.db.transaction(()=>{
    store.put('campaign_recipients',result);
    const current=store.get<Campaign>('campaigns',campaign.id)!;
    if(pause&&['running','queued'].includes(current.status))store.put('campaigns',{...current,status:'paused',note:result.error!});
    if(result.status==='accepted'){
      const lead=store.get<Lead>('leads',recipient.leadId);if(lead&&['New','Qualified'].includes(lead.stage))store.put('leads',{...lead,stage:'Contacted',updatedAt:now()});
    }
  })();
}
