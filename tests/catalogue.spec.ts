import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';

async function openFilters(page:Page){const button=page.getByRole('button',{name:'Filters',exact:true});if(await button.isVisible())await button.click();}

test('catalogue filters link the selected product to all matching buyer categories',async({page},testInfo)=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/#Product%20catalogue?mode=live');
  await expect(page.getByRole('heading',{name:'Good products. Great possibilities.'})).toBeVisible();
  await expect(page.locator('.catalogue-product-card')).toHaveCount(15);
  await page.screenshot({path:`artifacts/catalogue-${testInfo.project.name}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:/Bakery kitchen/}).click();
  await expect(page.locator('.catalogue-product-card')).toHaveCount(5);
  await openFilters(page);await page.getByRole('button',{name:/^Baking essentials/}).click();
  await expect(page.locator('.catalogue-product-card')).toHaveCount(4);await page.reload();
  await expect(page.locator('.catalogue-product-card')).toHaveCount(4);
  await page.getByRole('button',{name:'Clear all',exact:true}).click();
  await page.getByLabel('Search products').fill('Vanilla');await expect(page.locator('.catalogue-product-card')).toHaveCount(1);
  await expect(page.locator('.catalogue-buyer-link')).toContainText('45');
  await page.getByRole('button',{name:/Find buyers for Vanilla/}).click();
  await expect(page.getByRole('heading',{name:'Find your next customer'})).toBeVisible();
  await expect(page.locator('.results-toolbar')).toContainText('45 businesses');
  await expect(page).toHaveURL(/product=6613008285859/);
  await page.getByRole('button',{name:'Filters',exact:true}).click();
  await expect(page.getByLabel('Product match')).toHaveValue('6613008285859');
  expect(errors).toEqual([]);expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('product comparison keeps pack prices clear and sample selection persists and exports',async({page},testInfo)=>{
  await page.goto('/#Product%20catalogue?mode=live');
  await page.getByRole('checkbox',{name:'Compare Demerara Brown Sugar Sachets',exact:true}).check();
  await page.getByRole('checkbox',{name:'Compare Jaggery Powder Sachets',exact:true}).check();
  await page.getByRole('checkbox',{name:'Compare White Sugar Sachets',exact:true}).check();
  await expect(page.getByRole('checkbox',{name:'Compare Desi Khand Sachets',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:'Compare products',exact:true}).click();
  await expect(page.getByRole('dialog')).toContainText('10 Kg');
  await expect(page.getByRole('dialog')).toContainText('₹1,399');
  await page.getByRole('button',{name:'Add to sample list',exact:true}).first().click();
  await expect(page.getByRole('button',{name:'In sample list',exact:true})).toBeVisible();
  await page.screenshot({path:`artifacts/catalogue-compare-${testInfo.project.name}.png`,fullPage:true,animations:'disabled'});
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.reload();await page.getByRole('button',{name:'Open sample list, 1 products'}).click();
  await expect(page.getByRole('dialog')).toContainText('Saved in this browser only');
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Download selection'}).click();
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('dhampur-green-product-selection.csv');
  const csv=await readFile((await download.path())!,'utf8');expect(csv).toContain('demerara-brown-sugar-sachets');expect(csv).toContain('10 Kg');expect(csv).toContain('not a B2B quote');
  await page.getByRole('dialog').getByRole('button',{name:'Remove Demerara Brown Sugar Sachets from sample list'}).click();
  await expect(page.getByRole('heading',{name:'Make it a thoughtful first sample'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)).toBe(false);
});

test('product briefs preserve source, snapshot and variant context across shared links',async({page},testInfo)=>{
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.goto('/#Product%20catalogue?mode=live&item=7161040896163');
  await expect(page.getByRole('dialog')).toContainText('Not a B2B quote.');
  await expect(page.locator('.catalogue-detail-price')).toContainText('10 Kg');
  await page.getByRole('button',{name:'Copy product brief'}).click();
  const brief=await page.evaluate(()=>navigator.clipboard.readText());expect(brief).toContain('Recorded pack: 10 Kg');expect(brief).toContain('https://www.dhampurgreen.com/products/demerara-brown-sugar-sachets');
  expect(brief).toContain('Confirm sample size, MOQ, stock, lead time and trade pricing');
  await page.reload();await expect(page.getByRole('dialog')).toBeVisible();
  await page.screenshot({path:`artifacts/catalogue-detail-${testInfo.project.name}.png`,fullPage:true,animations:'disabled'});
  expect(await page.getByRole('dialog').evaluate(element=>element.scrollWidth>element.clientWidth)).toBe(false);
  await page.getByRole('button',{name:'Close dialog'}).click();
  await page.getByLabel('Search products').fill('A product that is not in the catalogue');
  await expect(page.getByRole('heading',{name:'No products match these filters'})).toBeVisible();
  await page.getByRole('region',{name:'Product results'}).getByRole('button',{name:'Reset catalogue filters'}).click();
  await expect(page.locator('.catalogue-product-card')).toHaveCount(15);
});
