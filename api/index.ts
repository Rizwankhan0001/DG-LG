import { readFileSync } from 'node:fs';
import { createStore } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { seedResearch } from '../server/research.js';
import type { Product } from '../shared/types.js';

// The public deployment contains only the versioned public research and sample workspace.
// No local CRM database, notes, passwords or provider credentials are uploaded.
// Write routes are blocked before authentication or provider calls can execute.
if(!process.env.APP_URL){
  const domain=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;
  if(domain)process.env.APP_URL=`https://${domain}`;
}
process.env.WORKER_ENABLED='false';
const store=createStore(':memory:');
seed(store,JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')) as Product[]);
seedResearch(store);
export default createApp(store,{readOnly:true});
