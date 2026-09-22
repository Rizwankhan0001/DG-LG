import { join } from 'node:path';

export function applyHostingDefaults(env:NodeJS.ProcessEnv=process.env) {
  // Use the provider's assigned URL; a custom APP_URL always takes priority.
  if(!env.APP_URL) {
    if(env.RENDER_EXTERNAL_URL)env.APP_URL=env.RENDER_EXTERNAL_URL;
    else if(env.RAILWAY_PUBLIC_DOMAIN)env.APP_URL=`https://${env.RAILWAY_PUBLIC_DOMAIN}`;
  }
  if(!env.HOST&&(env.RENDER||env.RAILWAY_ENVIRONMENT_ID))env.HOST='0.0.0.0';
  if(env.RAILWAY_VOLUME_MOUNT_PATH) {
    env.DATABASE_PATH ||= join(env.RAILWAY_VOLUME_MOUNT_PATH,'grow.db');
    env.BACKUP_DIR ||= join(env.RAILWAY_VOLUME_MOUNT_PATH,'backups');
  }
}
