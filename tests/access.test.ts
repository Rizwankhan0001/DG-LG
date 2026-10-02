import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { createStore } from '../server/db';
import { createApp } from '../server/app';

const password='owner-secret-password-123';
async function fixture({configured=true,readOnly=false}={}){
  const before={password:process.env.ADMIN_PASSWORD,email:process.env.ADMIN_EMAIL};
  process.env.ADMIN_PASSWORD=configured?password:'';process.env.ADMIN_EMAIL='owner@example.test';
  const store=createStore(':memory:');const server=createApp(store,{readOnly}).listen(0,'127.0.0.1');await once(server,'listening');
  const base=`http://127.0.0.1:${(server.address() as {port:number}).port}/api`;
  const request=async(path:string,body?:unknown,cookie='',method=body?'POST':'GET')=>{
    const response=await fetch(base+path,{method,headers:{'Content-Type':'application/json','X-Requested-With':'Grow',Cookie:cookie},...(body?{body:JSON.stringify(body)}:{})});
    return {status:response.status,data:await response.json(),cookie:response.headers.get('set-cookie')?.split(';')[0]||''};
  };
  const login=(email='owner@example.test',secret=password)=>request('/auth/login',{email,password:secret});
  return {store,request,login,close:async()=>{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.db.close();for(const [key,value] of [['ADMIN_PASSWORD',before.password],['ADMIN_EMAIL',before.email]]){if(value===undefined)delete process.env[key!];else process.env[key!]=value;}}};
}

test('unconfigured and anonymous deployments fail closed, including the read-only preview',async()=>{
  for(const readOnly of [true,false]){
    const f=await fixture({configured:false,readOnly});try{
      const state=await f.request('/auth/status');assert.equal(state.data.role,'visitor');assert.equal(state.data.configured,false);
      for(const route of ['/bootstrap','/bootstrap?mode=demo','/ingredient-intelligence','/leads/export','/integrations','/readiness','/credentials/accounts'])assert.equal((await f.request(route)).status,401,route);
      assert.equal((await f.login()).status,401);
      assert.equal((await f.request('/health')).status,200);
    }finally{await f.close();}
  }
});
test('owner can share ingredient access while every other workspace API stays owner-only',async()=>{
  const f=await fixture();try{
    const owner=(await f.login()).cookie;assert.ok(owner);
    assert.equal((await f.request('/bootstrap',undefined,owner)).status,200);
    const created=await f.request('/credentials/accounts',{email:'Member@Example.test',password:'member-password-123'},owner);
    assert.equal(created.status,201);assert.equal(created.data.email,'member@example.test');assert.ok(!JSON.stringify(created.data).includes('password'));
    assert.equal((await f.request('/credentials/accounts',{email:'owner@example.test',password:'member-password-123'},owner)).status,409);
    assert.equal((await f.request('/credentials/accounts',{email:'second@example.test',password:'short'},owner)).status,400);
    assert.equal((await f.request('/credentials/accounts',{email:'second@example.test',password:'member-password-123',role:'owner'},owner)).status,400);
    const member=(await f.login('member@example.test','member-password-123')).cookie;
    assert.equal((await f.request('/auth/status',undefined,member)).data.role,'member');
    const ingredients=await f.request('/ingredient-intelligence',undefined,member);assert.equal(ingredients.status,200);assert.ok(Array.isArray(ingredients.data.companies));assert.ok(Array.isArray(ingredients.data.catalogue));
    assert.equal((await f.request('/ingredient-intelligence/companies/true-elements',{saved:true},member,'PATCH')).status,200);
    assert.equal((await f.request('/ingredient-intelligence/companies/true-elements/lead',{},member)).status,403);
    for(const route of ['/bootstrap','/bootstrap?mode=demo','/data-quality','/readiness','/leads/export','/integrations','/campaigns','/credentials/accounts','/settings','/unknown'])assert.equal((await f.request(route,undefined,member)).status,403,route);
    for(const [route,method] of [['/discover','POST'],['/settings','PATCH'],['/leads','POST'],['/campaign-permissions','POST'],['/credentials/accounts','POST'],[`/credentials/accounts/${created.data.id}`,'DELETE']])assert.equal((await f.request(route,{},member,method)).status,403,route);
    assert.equal((await f.request('/auth/status',undefined,'grow_session=forged')).data.role,'visitor');
    assert.equal((await f.request('/credentials/accounts/'+created.data.id,{},owner,'DELETE')).status,200);
    assert.equal((await f.request('/auth/status',undefined,member)).data.role,'visitor');
    assert.equal((await f.login('member@example.test','member-password-123')).status,401);
  }finally{await f.close();}
});
test('password changes require the current password and invalidate every member session',async()=>{
  const f=await fixture();try{
    const owner=(await f.login()).cookie;
    await f.request('/credentials/accounts',{email:'member@example.test',password:'member-password-123'},owner);
    const first=(await f.login('member@example.test','member-password-123')).cookie;
    const second=(await f.login('member@example.test','member-password-123')).cookie;
    assert.equal((await f.request('/credentials/password',{currentPassword:'wrong',password:'updated-password-123'},first)).status,400);
    assert.equal((await f.request('/credentials/password',{currentPassword:'member-password-123',password:'updated-password-123'},first)).status,200);
    for(const cookie of [first,second])assert.equal((await f.request('/auth/status',undefined,cookie)).data.role,'visitor');
    assert.equal((await f.login('member@example.test','member-password-123')).status,401);
    const fresh=await f.login('member@example.test','updated-password-123');assert.ok(fresh.cookie);
    const token=fresh.cookie.split('=')[1];f.store.db.prepare('UPDATE access_sessions SET expires=0 WHERE token=?').run(createHash('sha256').update(token).digest('hex'));
    assert.equal((await f.request('/auth/status',undefined,fresh.cookie)).data.role,'visitor');
  }finally{await f.close();}
});
test('preview requires owner sign-in but never permits member provisioning',async()=>{
  const f=await fixture({readOnly:true});try{
    assert.equal((await f.request('/bootstrap')).status,401);
    const owner=(await f.login()).cookie;assert.ok(owner);
    assert.equal((await f.request('/bootstrap',undefined,owner)).status,200);
    assert.equal((await f.request('/credentials/accounts',{email:'member@example.test',password:'member-password-123'},owner)).status,503);
    assert.equal((await f.request('/auth/logout',{},owner)).status,200);
    assert.equal((await f.request('/bootstrap',undefined,owner)).status,401);
  }finally{await f.close();}
});
