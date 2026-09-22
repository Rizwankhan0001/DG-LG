import 'dotenv/config';
import { createStore } from '../server/db.js';
import { backupDatabase } from '../server/backups.js';
const store=createStore(process.env.DATABASE_PATH||'./data/grow.db');
try {
  const path=await backupDatabase(store,process.env.BACKUP_DIR||'./data/backups',Number(process.env.BACKUP_RETENTION)||7);
  console.log(`Database snapshot saved: ${path}`);
} finally {store.db.close();}
