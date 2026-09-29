import { test, expect } from '@playwright/test';

test('ingredient workspace filters real product evidence and explains the workflow',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:/Your ingredients/})).toBeVisible();
  await expect(page.locator('.ib-match-card')).toHaveCount(33);
  await page.locator('.ib-workflow summary').click();await expect(page.locator('.ib-steps')).toBeVisible();
  await page.getByLabel('Ingredient family',{exact:true}).selectOption('Khandsari / khand');await expect(page.locator('.ib-match-card')).toHaveCount(3);
  await page.getByLabel('Ingredient evidence filter').selectOption('compound');await expect(page.locator('.ib-match-card')).toHaveCount(1);
  await page.getByRole('button',{name:'Why they fit & who to contact'}).click();await expect(page.getByRole('dialog')).toContainText('Inside a component');await expect(page.getByRole('dialog').getByRole('link',{name:'Official product evidence'})).toHaveAttribute('href',/thegoodkindfoods.com/);
  await page.reload();await expect(page.getByRole('dialog')).toContainText('Hazelnut Chocolate Cookies');await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Reset filters'}).click();await page.screenshot({path:`artifacts/ingredient-buyers-${info.project.name}.png`,fullPage:false,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});
test('quantity scenario keeps assumptions visible, saves and survives reload',async({page},info)=>{
  await page.goto('/#Ingredient%20buyers?buyerProduct=true-elements-8231688601838');await page.getByRole('button',{name:'Buying potential',exact:true}).click();
  await expect(page.getByLabel('Ingredient in recipe (%)')).toHaveValue('16');await expect(page.getByLabel('Weight of one finished pack (g)')).toHaveValue('700');
  await page.getByLabel('Finished packs per month').fill('10000');await page.getByLabel('Your possible supply share (%)').fill('25');await expect(page.locator('.ib-quantity-result')).toContainText('280 kg');await expect(page.locator('.ib-quantity-result')).toContainText('ILLUSTRATIVE');
  await page.getByLabel('Input assumptions / confirmation evidence').fill('');await page.getByLabel('Basis of these inputs').selectOption('Buyer confirmed');await expect(page.getByRole('button',{name:'Save quantity scenario'})).toBeDisabled();await page.getByLabel('Basis of these inputs').selectOption('Illustration');
  await page.getByLabel('Input assumptions / confirmation evidence').fill(`Planning example only - ${info.project.name}`);await page.getByRole('button',{name:'Save quantity scenario'}).click();await expect(page.locator('.toast')).toContainText('Quantity scenario saved');
  await page.reload();await page.getByRole('button',{name:'Buying potential',exact:true}).click();await expect(page.getByLabel('Input assumptions / confirmation evidence')).toHaveValue(`Planning example only - ${info.project.name}`);
  await page.screenshot({path:`artifacts/ingredient-potential-${info.project.name}.png`,animations:'disabled'});expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
});
test('purchasing contact verification creates one ingredient-specific sales lead',async({page},info)=>{
  const company=info.project.name==='desktop'?'The Snack Company':'Early Foods';const product=info.project.name==='desktop'?'the-snack-company-8081717919893':'earlyfoods-6917062393898';await page.goto('/#Ingredient%20buyers?buyerProduct='+product);await page.getByRole('button',{name:'Next steps',exact:true}).click();await expect(page.getByRole('button',{name:/qualified buyer to sales|Open sales lead/})).toBeDisabled();
  await page.getByRole('button',{name:'Purchasing team',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('not a verified purchasing contact');
  await page.getByLabel('Buyer name',{exact:true}).fill('Test Procurement Contact');await page.getByLabel('Role / purchasing responsibility').fill('Ingredient purchase manager');await page.getByLabel('Business email · optional').fill(`buyer-${info.project.name}@business.test`);await page.getByLabel('Contact verification source URL').fill('https://business.test/procurement');await page.getByRole('checkbox',{name:/I checked this person/}).check();await page.getByRole('button',{name:'Save verified contact'}).click();await expect(page.getByRole('status')).toContainText('Buyer details saved');
  await page.getByRole('button',{name:'Next steps',exact:true}).click();await page.getByRole('button',{name:'Add qualified buyer to sales'}).click();await expect(page.getByRole('dialog')).toContainText(company);await expect(page.getByRole('dialog')).toContainText('Food manufacturers');
  await page.getByRole('button',{name:'Product opportunity',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Ingredient-based buying opportunity');
});
test('research centre and manual evidence entry explain actual automation coverage',async({page})=>{
  await page.goto('/#Ingredient%20buyers');await page.getByRole('button',{name:'Research centre',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Amazon access is not connected');await expect(page.locator('.ib-source-selection input')).toHaveCount(7);await expect(page.getByRole('button',{name:'Enable daily research'})).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Add product evidence',exact:true}).click();await page.getByLabel('Company',{exact:true}).selectOption('new');await expect(page.getByLabel('Official company website')).toBeVisible();await expect(page.getByLabel('Published ingredient list')).toBeVisible();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
});
