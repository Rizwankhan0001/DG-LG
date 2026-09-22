import { readFileSync } from 'node:fs';
import { z } from 'zod';
import { cities, segments, type Lead } from '../shared/types.js';
import type { Store } from './db.js';
import { newLead } from './service.js';

const recordSchema = z.object({
  id: z.string(), name: z.string(), city: z.enum(cities), segment: z.enum(segments),
  area: z.string(), website: z.string().url(), sourceUrl: z.string().url(),
  sourceAt: z.string().datetime(), phone: z.string(),
  email: z.union([z.literal(''), z.string().email()]), contactContext: z.string(), brand:z.string().optional(),
  directoryId:z.string().optional(),
  researchCheck:z.object({checkedAt:z.string().datetime(),url:z.string().url(),changes:z.array(z.object({field:z.enum(['name','area','phone','email']),current:z.string(),published:z.string()}))}).optional(),
  evidence:z.array(z.object({field:z.enum(['name','area','phone','email']),value:z.string(),url:z.string().url(),checkedAt:z.string().datetime()})).optional(),
});
export const researchedBusinesses = z.array(recordSchema).parse(
  JSON.parse(readFileSync(new URL('../data/researched-leads.json', import.meta.url), 'utf8')),
);

// Stable source IDs make restarts safe and preserve notes, contact edits and sales stages.
export function seedResearch(store: Store) {
  let added = 0;
  for (const record of researchedBusinesses) {
    const existing=store.get<Lead>('leads', record.id);
    if (existing) {
      const newer=record.researchCheck&&(!existing.researchCheck||record.researchCheck.checkedAt>existing.researchCheck.checkedAt);
      if(record.brand&&!existing.brand||newer)store.put('leads',{...existing,brand:existing.brand||record.brand,...(newer?{directoryId:record.directoryId,researchCheck:{...record.researchCheck!,changes:record.researchCheck!.changes.map(change=>({...change,current:existing[change.field]})).filter(change=>change.current!==change.published)}}:{})});
      continue;
    }
    const evidence = record.evidence ?? (['name', 'area', 'phone', 'email'] as const)
      .filter(field => record[field])
      .map(field => ({ field, value: record[field], url: record.sourceUrl, checkedAt: record.sourceAt }));
    const lead = newLead(store, {
      ...record, evidence, source: 'Official business website', sourceId: `research:${record.id}`,
      emailSource: record.email ? 'Published on official business website' : '',
      tags: ['Researched starter list'], value: 0, rating: null, reviews: 0, demo: false,
    });
    if (store.saveLead(lead)) added++;
  }
  if (added) store.activity(`${added} researched business locations added from official websites. Purchasing interest is unconfirmed.`, false, 'discovery');
  return added;
}
