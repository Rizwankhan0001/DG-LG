import { request } from '@playwright/test';
import { rm } from 'node:fs/promises';
export default async function setup(){
  const client=await request.newContext({baseURL:'http://127.0.0.1:5185'});
  const response=await client.post('/api/auth/login',{headers:{'X-Requested-With':'Grow'},data:{email:'owner@example.test',password:'e2e-owner-password-123456'}});
  if(!response.ok())throw new Error(`Could not authenticate the browser test owner: ${response.status()} ${await response.text()}`);
  const path=process.env.GROW_E2E_AUTH_STATE!;
  await client.storageState({path});await client.dispose();
  return ()=>rm(path,{force:true});
}
