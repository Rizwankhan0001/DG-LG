import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export default defineConfig({
  testDir:'./tests',testMatch:'**/*.spec.ts',fullyParallel:false,workers:1,
  timeout:30000,retries:0,reporter:'list',
  use:{baseURL:'http://127.0.0.1:5185',trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[{name:'desktop',use:{...devices['Desktop Chrome'],viewport:{width:1440,height:1000}}},{name:'mobile',use:{...devices['iPhone 13'],defaultBrowserType:'chromium'}}],
  webServer:{
    command:'npx concurrently -k "tsx server/index.ts" "vite --host 127.0.0.1 --port 5185 --strictPort"',
    url:'http://127.0.0.1:5185',reuseExistingServer:false,timeout:30000,
    env:{PORT:'3015',HOST:'127.0.0.1',DATABASE_PATH:join(tmpdir(),`grow-e2e-${Date.now()}.db`),VITE_API_URL:'http://127.0.0.1:3015',APP_URL:'http://127.0.0.1:5185',ADMIN_PASSWORD:'',WORKER_ENABLED:'true',GOOGLE_PLACES_API_KEY:'',OPENAI_API_KEY:'',HUNTER_API_KEY:'',RESEND_API_KEY:'',OUTREACH_ENABLED:'false'}
  }
});
