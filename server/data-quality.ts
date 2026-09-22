import type { Store } from './db.js';
import { cities, segments, type DataReport, type DirectoryStatus, type Lead, type Automation } from '../shared/types.js';
import { directorySources } from './directories.js';
import { readFileSync } from 'node:fs';
const packagedReport=JSON.parse(readFileSync(new URL('../data/research-refresh-report.json',import.meta.url),'utf8')) as {checkedAt:string;sources:{source:string;count:number;error?:string}[]};

export function dataReport(store:Store):DataReport {
  const leads=store.list<Lead>('leads').filter(lead=>!lead.demo);
  const day=new Date().toISOString().slice(0,10);
  const usage=(kind:string)=>(store.db.prepare('SELECT count FROM usage WHERE day=? AND kind=?').get(day,kind) as {count:number}|undefined)?.count??0;
  const hasEvidence=(lead:Lead)=>!!lead.evidence?.length;
  const stale=(lead:Lead)=>!hasEvidence(lead)||lead.evidence!.some(item=>Date.now()-Date.parse(item.checkedAt)>90*86400000);
  return {total:leads.length,withEvidence:leads.filter(hasEvidence).length,withPhone:leads.filter(l=>l.phone).length,withEmail:leads.filter(l=>l.email).length,
    uniquePhones:new Set(leads.filter(l=>l.phone).map(l=>l.phone.replace(/\D/g,'').slice(-10))).size,uniqueEmails:new Set(leads.filter(l=>l.email).map(l=>l.email.toLowerCase())).size,
    stale:leads.filter(stale).length,needsReview:leads.filter(l=>l.researchCheck?.changes.length).length,brands:new Set(leads.map(l=>l.brand||l.name)).size,
    byCity:cities.map(city=>({city,count:leads.filter(l=>l.city===city).length})),bySegment:segments.map(segment=>({segment,count:leads.filter(l=>l.segment===segment).length})),
    sources:directorySources.map(source=>{const packaged=packagedReport.sources.find(item=>item.source===source.url);return {...source,status:store.get<DirectoryStatus>('directory_status',source.id)??(packaged?{id:source.id,checkedAt:packagedReport.checkedAt,count:packaged.count,error:packaged.error}:undefined)};}),
    ai:{configured:!!process.env.OPENAI_API_KEY,used:usage('ai_requests'),limit:Number(process.env.DAILY_AI_LIMIT)||50},
    google:{configured:!!process.env.GOOGLE_PLACES_API_KEY,used:usage('places_requests'),limit:Number(process.env.DAILY_DISCOVERY_LIMIT)||100},
    scheduledRefresh:store.list<Automation>('automations').some(rule=>rule.mode==='live'&&rule.enabled),
  };
}
