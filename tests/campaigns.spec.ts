import { test, expect } from '@playwright/test';

test('campaign planner explains shortfalls, changes batch sizes and stays read-only in public preview',async({page},testInfo)=>{
  await page.route('**/api/bootstrap*',async route=>{const response=await route.fetch();await route.fulfill({response,json:{...await response.json(),readOnly:true}});});
  const mutations:string[]=[];page.on('request',req=>{if(req.url().includes('/api/')&&req.method()==='POST')mutations.push(req.url());});
  await page.goto('/#Campaigns?mode=live');await expect(page.getByRole('heading',{name:/One thoughtful message/})).toBeVisible();
  await expect.poll(async()=>Number(await page.locator('.campaign-stat-grid strong').first().textContent())).toBeGreaterThanOrEqual(303);
  await expect(page.getByRole('button',{name:'Review 0 messages',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'150',exact:true}).click();await expect(page.getByLabel('Custom batch size')).toHaveValue('150');
  await expect(page.locator('.campaign-shortfall').first()).toContainText('0 of 150');
  await page.getByRole('button',{name:/Ready to send/}).click();await expect(page.getByRole('heading',{name:'No send-ready contacts yet'})).toBeVisible();
  await page.getByRole('button',{name:/Research shortlist/}).click();await page.locator('.campaign-candidate details').first().locator('summary').click();await expect(page.locator('.campaign-candidate details').first()).toContainText('Catalogue matches');
  await page.screenshot({path:`artifacts/campaigns-${testInfo.project.name}.png`,fullPage:true,animations:'disabled'});
  await page.getByLabel('Send through').selectOption('whatsapp');await page.getByRole('button',{name:'View connection steps'}).click();await expect(page.getByRole('dialog')).toContainText('WHATSAPP_ACCESS_TOKEN');await expect(page.getByRole('button',{name:'Load approved Meta template'})).toBeDisabled();await page.getByRole('button',{name:'Close dialog'}).click();
  expect(mutations).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('opt-in, personalised batch review and cancellation persist without sending',async({page,request},testInfo)=>{
  const headers={'X-Requested-With':'Grow'};const name=`Campaign distributor ${testInfo.project.name}`;
  const response=await request.post('/api/leads',{headers,data:{name,city:'Kolkata',segment:'Distributors',email:`campaign-${testInfo.project.name}@business.test`,mode:'live'}});expect(response.status()).toBe(201);const lead=await response.json();
  await page.goto(`/#Discover%20leads?mode=live&lead=${lead.id}`);await page.getByRole('button',{name:'Permissions',exact:true}).click();
  await page.getByLabel('Where and when did the buyer agree or opt out?').fill('Buyer signed our product updates form; record TEST-123.');await page.getByRole('checkbox',{name:/I have a record/}).check();await page.getByRole('button',{name:'Record opt-in',exact:true}).click();await expect(page.getByRole('dialog')).toContainText(`granted · campaign-${testInfo.project.name}@business.test`);await page.getByRole('button',{name:'Close dialog'}).click();
  await page.goto('/#Campaigns?mode=live');await page.getByLabel('City',{exact:true}).selectOption('Kolkata');await page.getByLabel('Buyer category',{exact:true}).selectOption('Distributors');
  await expect(page.getByRole('button',{name:'Review 1 messages'})).toBeEnabled();await page.getByLabel('Campaign name').fill(`Reviewed batch ${testInfo.project.name}`);await page.getByRole('button',{name:'Review 1 messages'}).click();
  await expect(page.getByRole('dialog')).toContainText(name);await page.locator('.campaign-saved-recipients summary').click();await expect(page.locator('.campaign-saved-recipients pre')).toContainText('Kolkata');await expect(page.locator('.campaign-saved-recipients pre')).not.toContainText('{{business}}');await expect(page.getByRole('button',{name:'Start batch',exact:true})).toBeDisabled();
  await page.screenshot({path:`artifacts/campaign-review-${testInfo.project.name}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Cancel pending'}).click();await expect(page.getByRole('dialog')).toContainText('cancelled');await page.getByRole('button',{name:'Close dialog'}).click();await page.reload();await expect(page.locator('.campaign-history')).toContainText(`Reviewed batch ${testInfo.project.name}`);await expect(page.locator('.campaign-history')).toContainText('cancelled');
  // Keep later tests independent; this is test data on a temporary database.
  await request.patch(`/api/leads/${lead.id}`,{headers,data:{suppressed:true}});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});
