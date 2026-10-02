import { test, expect } from '@playwright/test';

test('visitors see Credentials and locked navigation; direct URLs cannot load workspace data',async({browser,baseURL},testInfo)=>{
  const context=await browser.newContext({baseURL,viewport:testInfo.project.use.viewport,storageState:{cookies:[],origins:[]}});
  const page=await context.newPage();const requests:string[]=[];
  page.on('request',request=>{if(request.url().includes('/api/'))requests.push(new URL(request.url()).pathname);});
  await page.goto('/#Reports');
  await expect(page.getByRole('heading',{name:'Credentials',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Sign in to Grow'})).toBeVisible();
  await expect(page).toHaveURL(/#Credentials$/);
  expect(requests).not.toContain('/api/bootstrap');
  expect((await context.request.get('/api/bootstrap')).status()).toBe(401);
  if(testInfo.project.name==='mobile')await page.getByRole('button',{name:'Open navigation'}).click();
  await expect(page.getByRole('button',{name:'Reports Locked',exact:true})).toHaveAttribute('aria-disabled','true');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/credentials-visitor-${testInfo.project.name}.png`,fullPage:true});
  await context.close();
});

test('owner creates and revokes a member; member can use ingredients but no other section',async({page,browser,baseURL},testInfo)=>{
  const email=`restricted-${testInfo.project.name}-${Date.now()}@example.test`;
  await page.goto('/#Credentials');
  await expect(page.getByText('Owner · Full access')).toBeVisible();
  await page.getByLabel('Member email').fill(email);
  await page.getByLabel('Initial password').fill('member-password-123456');
  await page.getByRole('button',{name:'Create ingredient account'}).click();
  await expect(page.getByText(email,{exact:true})).toBeVisible();
  await page.screenshot({path:`artifacts/credentials-owner-${testInfo.project.name}.png`,fullPage:true});
  const context=await browser.newContext({baseURL,viewport:testInfo.project.use.viewport,storageState:{cookies:[],origins:[]}});
  const member=await context.newPage();await member.goto('/');
  await member.getByLabel('Work email').fill(email);await member.getByLabel('Password',{exact:true}).fill('incorrect-password');
  await member.getByRole('button',{name:'Sign in to Grow'}).click();
  await expect(member.getByRole('alert')).toHaveText('Incorrect email or password.');
  await member.getByLabel('Password',{exact:true}).fill('member-password-123456');
  await member.getByRole('button',{name:'Sign in to Grow'}).click();
  await expect(member.getByText('Member · Ingredient access')).toBeVisible();
  await member.goto('/#Ingredient%20buyers');
  await expect(member.getByRole('heading',{name:/Your ingredients/})).toBeVisible();
  expect((await context.request.get('/api/ingredient-intelligence')).status()).toBe(200);
  await member.goto('/#Reports');
  await expect(member).toHaveURL(/#Ingredient%20buyers$/);
  expect((await context.request.get('/api/credentials/accounts')).status()).toBe(403);
  await member.screenshot({path:`artifacts/credentials-member-${testInfo.project.name}.png`,fullPage:true});
  await page.getByRole('button',{name:`Revoke access for ${email}`}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Revoke access',exact:true}).click();
  await expect(page.getByText(email,{exact:true})).toHaveCount(0);
  await expect(member.getByRole('button',{name:'Sign in to Grow'})).toBeVisible({timeout:10000});
  await context.close();
});
