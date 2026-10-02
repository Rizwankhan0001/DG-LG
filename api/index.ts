import { readFileSync } from 'node:fs';
import { createStore } from '../server/db.js';
import { createApp } from '../server/app.js';
import { seed } from '../server/seed.js';
import { seedResearch } from '../server/research.js';
import type { Product } from '../shared/types.js';

// The preview contains only versioned public research and the sample workspace.
// Owner sign-in is required even in the preview; configure ADMIN_EMAIL and ADMIN_PASSWORD
// in the hosting environment. No local database or .env is uploaded.
// Workspace writes and member provisioning require the persistent private backend.
if(!process.env.APP_URL){
  const domain=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;
  if(domain)process.env.APP_URL=`https://${domain}`;
}
process.env.WORKER_ENABLED='false';
const store=createStore(':memory:');
seed(store,JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')) as Product[]);
seedResearch(store);
export default createApp(store,{readOnly:true});
