import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { BuyerCompany, BuyerProduct } from '../shared/intelligence';
import { buyerReadiness } from '../shared/buyer-readiness';
const companies = JSON.parse(readFileSync(new URL('../data/buyer-companies.json', import.meta.url), 'utf8')) as BuyerCompany[];
const products = JSON.parse(readFileSync(new URL('../data/buyer-products.json', import.meta.url), 'utf8')) as BuyerProduct[];

test('compact company cards open the full sourced approach plan', async ({ page }, info) => {
  await page.goto('/#Ingredient%20buyers?buyerQ=Gauri%20Bhagwat');
  const card = page.getByRole('article', { name: 'True Elements company', exact: true });
  await expect(card).toContainText('Gauri Bhagwat');
  await expect(card.getByRole('button', { name: 'Copy approach brief' })).toHaveCount(0);
  expect((await card.boundingBox())!.height).toBeLessThan(380);
  await card.screenshot({ path: `artifacts/company-readiness-${info.project.name}.png` });
  // The stretched heading button makes the card surface clickable without nesting controls.
  await card.click({ position: { x: 12, y: 120 } });
  const plan = page.getByRole('region', { name: 'Company approach plan' });
  await expect(plan).toContainText('WHY THEY FIT'); await expect(plan).toContainText('NEXT STEP');
  await expect(plan.getByRole('link', { name: 'Professional profile' })).toHaveAttribute('href', /linkedin.com/);
  await page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (value: string) => { (window as unknown as { copiedBrief: string }).copiedBrief = value; } }, configurable: true }); });
  await plan.getByRole('button', { name: 'Copy approach brief' }).click();
  await expect(page.getByRole('status')).toContainText('Company approach brief copied');
  expect(await page.evaluate(() => (window as unknown as { copiedBrief: string }).copiedBrief)).toContain('Product evidence:');
  await plan.getByText('What still needs confirming', { exact: true }).click();
  await expect(plan).toContainText('Confirm factory, buying authority and monthly demand');
  await page.reload(); await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await card.getByRole('button', { name: 'True Elements', exact: true }).focus();
  await page.keyboard.press('Enter'); await expect(page.getByRole('dialog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)).toBe(false);
});

test('ingredient and business-contact filter and readiness ordering retain their state', async ({ page }) => {
  await page.goto('/#Ingredient%20buyers');
  const expected = companies.filter(c => { const r = buyerReadiness(c, products.filter(p => p.companyId === c.id)); return r.labels && (r.email || r.phone); });
  await page.getByLabel('Ingredient evidence filter').selectOption('approachable');
  await expect(page.locator('.ib-company-card')).toHaveCount(expected.length);
  await page.getByLabel('Sort ingredient buyers', { exact: true }).selectOption('readiness');
  const first = expected.sort((a, b) => buyerReadiness(b, products.filter(p => p.companyId === b.id)).score - buyerReadiness(a, products.filter(p => p.companyId === a.id)).score || a.name.localeCompare(b.name))[0];
  await expect(page.locator('.ib-company-card h3').first()).toHaveText(first.name);
  await page.reload(); await expect(page.getByLabel('Ingredient evidence filter')).toHaveValue('approachable');
  await expect(page.getByLabel('Sort ingredient buyers', { exact: true })).toHaveValue('readiness');
});
