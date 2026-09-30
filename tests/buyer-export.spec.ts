import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import type { BuyerCompany, BuyerProduct } from '../shared/intelligence';

const products = JSON.parse(readFileSync(new URL('../data/buyer-products.json', import.meta.url), 'utf8')) as BuyerProduct[];
const companies = JSON.parse(readFileSync(new URL('../data/buyer-companies.json', import.meta.url), 'utf8')) as BuyerCompany[];

async function downloadWorkbook(page: Page, scope: string) {
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download .xlsx', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toMatch(new RegExp(`^ingredient-buyers-${scope}-\\d{4}-\\d{2}-\\d{2}\\.xlsx$`));
  expect(await download.failure()).toBeNull();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile((await download.path())!);
  return workbook;
}

test('Excel downloads the filtered companies and can include all companies without resetting filters', async ({ page }, info) => {
  const mapro = products.filter(product => product.companyId === 'mapro' && product.matches.some(match => match.family === 'Cane jaggery'));
  await page.goto('/#Ingredient%20buyers?buyerQ=Mapro&ingredient=Cane%20jaggery');
  await expect(page.locator('.ib-company-card')).toHaveCount(1);
  await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(`1 company · ${mapro.length} matching ${mapro.length === 1 ? 'product' : 'products'}`);
  await page.screenshot({ path: `artifacts/buyer-excel-${info.project.name}.png`, animations: 'disabled' });
  expect(await page.getByRole('dialog').evaluate(el => el.scrollWidth > el.clientWidth)).toBe(false);
  const filtered = await downloadWorkbook(page, 'filtered');
  expect(filtered.getWorksheet('Companies')!.rowCount).toBe(2);
  expect(filtered.getWorksheet('Companies')!.getCell('A2').value).toBe('Mapro');
  expect(filtered.getWorksheet('Companies')!.getCell('C2').value).toBe('connect@mapro.com');
  expect(filtered.getWorksheet('Product matches')!.rowCount - 1).toBe(mapro.reduce((count, product) => count + product.matches.length, 0));
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
  await page.getByLabel('Export scope').selectOption('All companies');
  await expect(page.getByRole('dialog')).toContainText(`${companies.length} companies · ${products.length} matching products`);
  const all = await downloadWorkbook(page, 'all');
  expect(all.getWorksheet('Companies')!.rowCount - 1).toBe(companies.length);
  expect(all.getWorksheet('Product matches')!.rowCount - 1).toBe(products.reduce((count, product) => count + product.matches.length, 0));
  expect(all.getWorksheet('Export notes')!.getCell('B4').text).toContain('None');
  expect(all.getWorksheet('Contact people')!.rowCount - 1).toBe(companies.reduce((total, company) => total + company.contacts.length, 0));
  expect(all.getWorksheet('Contact routes')!.rowCount - 1).toBe(companies.reduce((total, company) => total + (company.contactRoutes?.length || 0), 0));
  await expect(page.getByLabel('Search ingredient buyers')).toHaveValue('Mapro');
  await expect(page.getByLabel('Ingredient family', { exact: true })).toHaveValue('Cane jaggery');
});

test('Excel remains available for read-only research and an empty filter can export all companies', async ({ page }) => {
  await page.route('**/api/ingredient-intelligence', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: { ...await response.json(), readOnly: true, workspaces: [] } });
  });
  await page.goto('/#Ingredient%20buyers?buyerQ=no-such-company-xyz');
  await page.getByRole('button', { name: 'Download Excel', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Download .xlsx', exact: true })).toBeDisabled();
  await expect(page.getByRole('dialog')).toContainText('No companies match the current filters.');
  await page.getByLabel('Export scope').selectOption('All companies');
  const all = await downloadWorkbook(page, 'all');
  expect(all.getWorksheet('Companies')!.rowCount - 1).toBe(companies.length);
});
