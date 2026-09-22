import type { Store } from './db.js';
import type { Job, Lead, DirectoryStatus } from '../shared/types.js';
import { branchKey, directorySources, fetchDirectory, comparableFact, type PublishedBusiness } from './directories.js';
import { newLead } from './service.js';

export function matchPublished(record:PublishedBusiness,leads:Lead[]) {
  return leads.find(lead=>!lead.demo&&lead.city===record.city&&(
    lead.id===record.id||
    (lead.brand===record.brand||lead.name.toLowerCase().startsWith(`${record.brand?.toLowerCase()} `))&&branchKey(lead.name)===branchKey(record.name)
  ));
}
export function applyPublished(store:Store,record:PublishedBusiness):{lead:Lead;added:boolean} {
  const existing=matchPublished(record,store.list<Lead>('leads'));
  const fields=['name','area','phone','email'] as const;
  if(existing){
    // Research updates never overwrite buyer notes, sales stages, demand plans, or edited contact details.
    const changes=fields.filter(field=>record[field]&&comparableFact(field,record[field])!==comparableFact(field,existing[field])).map(field=>({field,current:existing[field],published:record[field]}));
    const evidence=existing.evidence?.map(item=>record[item.field]&&comparableFact(item.field,record[item.field])===comparableFact(item.field,item.value)?{...item,checkedAt:record.sourceAt,url:record.sourceUrl}:item);
    const lead={...existing,brand:existing.brand||record.brand,directoryId:record.directoryId,evidence,researchCheck:{checkedAt:record.sourceAt,url:record.sourceUrl,changes}};
    store.put('leads',lead);return {lead,added:false};
  }
  const lead=newLead(store,{...record,source:'Official business website',sourceId:`research:${record.id}`,emailSource:'',tags:['Official directory'],evidence:fields.filter(field=>record[field]).map(field=>({field,value:record[field],url:record.sourceUrl,checkedAt:record.sourceAt})),researchCheck:{checkedAt:record.sourceAt,url:record.sourceUrl,changes:[]}});
  return {lead,added:store.saveLead(lead)};
}
export async function discoverOfficial(store:Store,job:Job):Promise<Lead[]> {
  const sources=directorySources.filter(source=>job.cities.includes(source.city)&&job.segments.includes(source.segment));
  if(!sources.length)throw new Error('No automatic official directory covers this city/category yet. Use the existing researched list or import sourced businesses by CSV.');
  const buckets:PublishedBusiness[][]=[];const problems:string[]=[];
  for(const source of sources){
    job.progress=`Reading ${source.name}`;store.put('jobs',job);
    try {
      const cached=store.get<{id:string;checkedAt:string;records:PublishedBusiness[]}>('directory_cache',source.id);
      let records=cached?.records;
      if(!cached||Date.now()-Date.parse(cached.checkedAt)>86400000){
        if(!store.reserveUsage('directory_requests',Number(process.env.DAILY_RESEARCH_LIMIT)||40))throw new Error('Daily official-source request limit reached. Try tomorrow.');
        records=await fetchDirectory(source);
        store.put('directory_cache',{id:source.id,checkedAt:records[0].sourceAt,records});
      }
      buckets.push([...(records??[])]);
      store.put<DirectoryStatus>('directory_status',{id:source.id,checkedAt:records?.[0]?.sourceAt,count:records?.length});
    }catch(error){const message=error instanceof Error?error.message:'Source unavailable';problems.push(`${source.name}: ${message}`);store.put('directory_status',{id:source.id,error:message});}
  }
  // Interleave directories to spread additions across markets instead of filling the limit from one chain page.
  const created:Lead[]=[];
  while(buckets.some(bucket=>bucket.length)){
    for(const bucket of buckets){const record=bucket.shift();if(!record)continue;
      const existing=matchPublished(record,store.list<Lead>('leads'));
      if(!existing&&created.length>=job.limit)continue;
      const result=applyPublished(store,record);
      if(result.added){created.push(result.lead);job.found++;}else job.duplicates++;
    }
  }
  if(problems.length){job.error=problems.join(' | ');if(!buckets.length)throw new Error(job.error);}
  return created;
}
