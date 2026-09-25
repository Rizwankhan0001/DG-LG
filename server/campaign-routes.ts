import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import type { Store } from './db.js';
import type { Lead } from '../shared/types.js';
import { destination, type Campaign } from '../shared/campaigns.js';
import { campaignAudience, campaignConfig, campaignFilters, controlCampaign, createCampaign, detail, loadWhatsAppTemplate } from './campaigns.js';

const asyncRoute=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
const permissionInput=z.object({leadId:z.string().min(1),address:z.string().min(1).max(200),channel:z.enum(['email','whatsapp']),status:z.enum(['granted','revoked']),note:z.string().trim().min(10).max(1000),confirmed:z.literal(true)}).strict();
export function campaignRoutes(store:Store){
  const router=Router();
  router.get('/campaigns',(_req,res)=>res.json({campaigns:store.list<Campaign>('campaigns').sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(c=>detail(store,c.id)),config:campaignConfig(store)}));
  router.get('/campaigns/audience',(req,res)=>res.json(campaignAudience(store,campaignFilters.parse({...req.query,limit:Number(req.query.limit??50)}))));
  router.post('/campaigns/whatsapp-template',asyncRoute(async(_req,res)=>res.json(await loadWhatsAppTemplate(store))));
  router.post('/campaigns',(req,res)=>{
    const input=z.object({requestId:z.string().uuid(),name:z.string().trim().min(3).max(100),filters:campaignFilters,subject:z.string().trim().min(1).max(180).refine(s=>!/[\r\n]/.test(s),'Subject must be one line'),body:z.string().trim().min(10).max(6000),leadIds:z.array(z.string()).min(1).max(500)}).strict().parse(req.body);
    res.status(201).json(createCampaign(store,input));
  });
  router.get('/campaigns/:id',(req,res)=>res.json(detail(store,req.params.id)));
  router.post('/campaigns/:id/control',(req,res)=>{const input=z.object({action:z.enum(['start','pause','cancel']),reviewed:z.boolean().default(false)}).strict().parse(req.body);res.json(controlCampaign(store,req.params.id,input.action,input.reviewed));});
  router.post('/campaign-permissions',(req,res)=>{
    const {rows}=z.object({rows:z.array(permissionInput).min(1).max(500)}).strict().parse(req.body);
    const updated=store.db.transaction(()=>rows.map(input=>{
      const lead=store.get<Lead>('leads',input.leadId);if(!lead||lead.demo)throw new Error('Record permission against a real business.');
      const address=destination(lead,input.channel);if(!address)throw new Error(`Add a valid ${input.channel} contact to ${lead.name} first.`);
      if(address!==input.address)throw new Error(`The contact for ${lead.name} changed. Review the exact address before recording permission.`);
      const permission={status:input.status,address,note:input.note,recordedAt:new Date().toISOString()};
      store.put('permission_history',{id:randomUUID(),leadId:lead.id,channel:input.channel,...permission});
      if(input.status==='revoked')store.put('channel_suppressions',{id:`${input.channel}:${address}`,createdAt:permission.recordedAt});
      return store.put('leads',{...lead,permissions:{...lead.permissions,[input.channel]:permission},updatedAt:permission.recordedAt});
    }))();
    store.activity(`Recorded ${updated.length} contact permission updates.`,false,'outreach');res.json({updated:updated.length});
  });
  return router;
}

export function whatsappWebhook(store:Store){
  const router=Router();
  router.get('/',(req,res)=>{
    if(!process.env.WHATSAPP_VERIFY_TOKEN||req.query['hub.mode']!=='subscribe'||req.query['hub.verify_token']!==process.env.WHATSAPP_VERIFY_TOKEN)return res.sendStatus(403);
    res.type('text/plain').send(String(req.query['hub.challenge']??''));
  });
  router.post('/',(req,res)=>{
    const secret=process.env.WHATSAPP_APP_SECRET;const raw=(req as Request&{rawBody?:Buffer}).rawBody;
    const signature=req.get('x-hub-signature-256')??'';
    if(!secret||!raw||!/^sha256=[a-f0-9]{64}$/.test(signature))return res.sendStatus(403);
    const expected=createHmac('sha256',secret).update(raw).digest();
    if(!timingSafeEqual(Buffer.from(signature.slice(7),'hex'),expected))return res.sendStatus(403);
    // Only verified inbound opt-outs change state; a delivery receipt is not buyer interest.
    const payload=z.object({entry:z.array(z.object({changes:z.array(z.object({value:z.object({messages:z.array(z.object({from:z.string(),text:z.object({body:z.string()}).optional(),button:z.object({text:z.string()}).optional()})).optional()})}))}))}).safeParse(req.body);
    if(payload.success)for(const entry of payload.data.entry)for(const change of entry.changes)for(const message of change.value.messages??[]){
      if(!/^(stop|unsubscribe|cancel|end|quit|stopall)$/i.test((message.text?.body??message.button?.text??'').trim()))continue;
      const address=destination({email:'',phone:'+'+message.from.replace(/^\+/,'')},'whatsapp');if(!address)continue;
      store.put('channel_suppressions',{id:`whatsapp:${address}`,createdAt:new Date().toISOString()});
      for(const lead of store.list<Lead>('leads').filter(l=>!l.demo&&destination(l,'whatsapp')===address))store.put('leads',{...lead,permissions:{...lead.permissions,whatsapp:{status:'revoked',address,note:'Buyer replied STOP through verified WhatsApp webhook.',recordedAt:new Date().toISOString()}}});
    }
    res.sendStatus(200);
  });
  return router;
}
