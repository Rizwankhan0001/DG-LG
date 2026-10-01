import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BuyerCompany, BuyerProduct } from '../shared/intelligence';
const products=JSON.parse(readFileSync(new URL('../data/buyer-products.json',import.meta.url),'utf8')) as BuyerProduct[];
const companies=JSON.parse(readFileSync(new URL('../data/buyer-companies.json',import.meta.url),'utf8')) as BuyerCompany[];

test('ingredient workspace filters compact company cards and opens product evidence through the company',async({page},info)=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/');await expect(page.getByRole('heading',{name:/Your ingredients/})).toBeVisible();
  await expect(page.getByRole('button',{name:'Companies',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('.ib-company-card')).toHaveCount(new Set(products.map(p=>p.companyId)).size);
  await expect(page.locator('.ib-match-card')).toHaveCount(0);
  await page.locator('.ib-workflow summary').click();await expect(page.locator('.ib-steps')).toBeVisible();
  await page.getByLabel('Ingredient family',{exact:true}).selectOption('Khandsari / khand');await expect(page.locator('.ib-company-card')).toHaveCount(new Set(products.filter(p=>p.matches.some(m=>m.family==='Khandsari / khand')).map(p=>p.companyId)).size);
  await page.getByLabel('Ingredient evidence filter').selectOption('compound');await page.getByLabel('Search ingredient buyers').fill('Hazelnut Chocolate Cookies');await expect(page.locator('.ib-company-card')).toHaveCount(1);
  await page.getByRole('button',{name:'The Good Kind',exact:true}).click();await page.getByLabel('Search company products',{exact:true}).fill('Hazelnut Chocolate Cookies');await page.locator('.ib-company-product-row').click();await expect(page.getByRole('dialog')).toContainText('Inside a component');await expect(page.getByRole('dialog').getByRole('link',{name:'Official product evidence'})).toHaveAttribute('href',/thegoodkindfoods.com/);
  await page.reload();await expect(page.getByRole('dialog')).toContainText('Hazelnut Chocolate Cookies');await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Reset filters'}).click();await page.getByRole('button',{name:'Product matches',exact:true}).click();await expect(page.locator('.ib-match-card')).toHaveCount(products.length);await page.getByRole('button',{name:'Companies',exact:true}).click();await page.locator('.ib-section-heading').scrollIntoViewIfNeeded();await page.screenshot({path:`artifacts/ingredient-companies-${info.project.name}.png`,fullPage:false,animations:'disabled'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);expect(errors).toEqual([]);
});
test('a company opens its full searchable product range and supports product drill-down and reload',async({page},info)=>{
  const companyProducts=products.filter(p=>p.companyId==='mapro');
  await page.goto('/#Ingredient%20buyers?buyerQ=Mapro');
  await expect(page.locator('.ib-company-card')).toHaveCount(1);
  await page.getByRole('article',{name:'Mapro company',exact:true}).getByRole('button',{name:`View all ${companyProducts.length} products`,exact:true}).click();
  await expect(page.locator('.ib-company-product-row')).toHaveCount(companyProducts.length);
  await expect(page).toHaveURL(/buyerCompany=mapro/);
  await page.reload();await expect(page.locator('.ib-company-product-row')).toHaveCount(companyProducts.length);
  await page.locator('.ib-company-contact summary').click();await expect(page.getByRole('dialog')).toContainText('connect@mapro.com');
  await page.getByLabel('Company ingredient family',{exact:true}).selectOption('Cane jaggery');
  await expect(page.locator('.ib-company-product-row')).toHaveCount(companyProducts.filter(p=>p.matches.some(m=>m.family==='Cane jaggery')).length);
  await page.getByLabel('Search company products',{exact:true}).fill('Oats Jaggery Cookie Coin');await expect(page.locator('.ib-company-product-row')).toHaveCount(1);
  await page.locator('.ib-company-product-row').click();await expect(page.getByRole('dialog').getByRole('heading',{name:'Oats Jaggery Cookie Coin',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('link',{name:'Official product evidence',exact:true})).toHaveAttribute('href',/mapro.com\/products\//);
  await page.getByRole('button',{name:'All products from Mapro',exact:true}).click();await expect(page.locator('.ib-company-product-row')).toHaveCount(companyProducts.length);
  await page.getByLabel('Search company products',{exact:true}).fill('no-such-product-xyz');await expect(page.getByRole('dialog')).toContainText('No products match this search.');await page.getByLabel('Search company products',{exact:true}).fill('');
  await page.screenshot({path:`artifacts/company-products-${info.project.name}.png`,animations:'disabled'});expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();await expect(page.getByRole('dialog')).toHaveCount(0);await expect(page.locator('.ib-company-card')).toHaveCount(1);
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
  await page.goto('/#Ingredient%20buyers');await page.getByRole('button',{name:'Research centre',exact:true}).click();await expect(page.getByRole('dialog')).toContainText('Amazon access is not connected');await expect(page.locator('.ib-source-selection input')).toHaveCount(new Set(products.map(p=>p.companyId)).size);await expect(page.locator('.ib-source-selection input:enabled')).toHaveCount(7);await expect(page.getByRole('button',{name:'Enable daily research'})).toBeVisible();await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Add product evidence',exact:true}).click();await page.getByLabel('Company',{exact:true}).selectOption('new');await expect(page.getByLabel('Official company website')).toBeVisible();await expect(page.getByLabel('Published ingredient list')).toBeVisible();expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
});

test('company research finds published people, preserves source limitations and exposes marketplace evidence',async({page},info)=>{
  await page.goto('/#Ingredient%20buyers?buyerQ=Gauri%20Bhagwat');
  await expect(page.locator('.ib-company-card')).toHaveCount(1);
  await page.getByRole('button',{name:'True Elements',exact:true}).click();
  await page.locator('.ib-company-contact summary').first().click();
  const people=page.getByRole('region',{name:'Published company people'});
  await expect(people).toContainText('Gauri Bhagwat');
  await expect(people).toContainText('current employment and buying authority');
  await expect(people.getByRole('link',{name:'Professional profile',exact:true})).toHaveAttribute('href',/linkedin.com\/in\/gauri-bhagwat/);
  await expect(people).toContainText('Published lead · confirm role');
  await page.screenshot({path:`artifacts/published-contacts-${info.project.name}.png`,animations:'disabled'});
  expect(await page.getByRole('dialog').evaluate(el=>el.scrollWidth>el.clientWidth)).toBe(false);
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByRole('button',{name:'Reset filters'}).click();
  await page.getByLabel('Ingredient evidence filter').selectOption('procurement');
  await expect(page.locator('.ib-company-card')).toHaveCount(companies.filter(c=>c.contacts.some(p=>p.department==='Procurement')).length);
  await page.goto('/#Ingredient%20buyers?buyerCompany=right-shift');
  await page.getByText('Marketplace sources · 2',{exact:true}).click();
  await expect(page.getByRole('dialog').getByRole('link',{name:'Instamart',exact:true})).toHaveAttribute('href',/swiggy.com\/instamart/);
  await expect(page.getByRole('dialog').getByRole('link',{name:'Zepto',exact:true})).toHaveAttribute('href',/zepto.com/);
});

test('company and contact sorting support titles, dates and role filters',async({page})=>{
  await page.goto('/#Ingredient%20buyers');
  await page.getByLabel('Sort ingredient buyers',{exact:true}).selectOption('name');
  await expect(page.locator('.ib-company-card h3').first()).toHaveText([...companies].sort((a,b)=>a.name.localeCompare(b.name))[0].name);
  await page.reload();await expect(page.getByLabel('Sort ingredient buyers',{exact:true})).toHaveValue('name');
  await page.getByLabel('Sort ingredient buyers',{exact:true}).selectOption('contacts');
  await expect(page.locator('.ib-company-card h3').first()).toHaveText([...companies].sort((a,b)=>b.contacts.length-a.contacts.length||a.name.localeCompare(b.name))[0].name);
  await page.goto('/#Ingredient%20buyers?buyerCompany=anandhaas');
  await page.locator('.ib-company-contact summary').first().click();
  await page.getByLabel('Filter contact roles',{exact:true}).selectOption('Sales');
  await expect(page.locator('.ib-person')).toHaveCount(2);
  await page.getByLabel('Sort contact people',{exact:true}).selectOption('title');
  await expect(page.locator('.ib-person').first()).toContainText('Madhu Padmanabhan');
  await expect(page.locator('.ib-person').first()).toContainText('Ask for an introduction to the raw-material purchasing team');
  await page.getByLabel('Filter contact roles',{exact:true}).selectOption('Procurement');
  await expect(page.getByRole('dialog')).toContainText('No published contacts match these role and source filters.');
});
