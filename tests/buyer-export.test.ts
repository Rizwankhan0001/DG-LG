import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { createBuyerWorkbook, type BuyerExportInput } from '../shared/buyer-export.js';
import type { BuyerCompany, BuyerProduct, SupplierMaterial } from '../shared/intelligence.js';
import type { Product } from '../shared/types.js';

const read = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../data/${name}.json`, import.meta.url), 'utf8'));
const research = {
  companies: read<BuyerCompany[]>('buyer-companies'),
  products: read<BuyerProduct[]>('buyer-products'),
  materials: read<SupplierMaterial[]>('supplier-materials'),
  workspaces: [],
};
const base: BuyerExportInput = {
  research, products: research.products, catalogue: read<Product[]>('catalog'),
  scope: 'All companies', filters: {}, exportedAt: new Date('2026-09-30T01:00:00Z'),
};
const cell = (sheet: ExcelJS.Worksheet, row: number, header: string) => {
  let column = 0;
  sheet.getRow(1).eachCell((cell, index) => { if (cell.text === header) column = index; });
  assert.ok(column, `Missing column ${header}`);
  return sheet.getCell(row, column);
};
async function roundTrip(input: BuyerExportInput) {
  const bytes = await createBuyerWorkbook(input).xlsx.writeBuffer();
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(bytes);
  return workbook;
}

test('Excel export round-trips all companies, ingredient evidence and contact sources without duplicate firms', async () => {
  const workbook = await roundTrip(base);
  assert.deepEqual(workbook.worksheets.map(sheet => sheet.name), ['Companies', 'Product matches', 'Contact people', 'Contact routes', 'Export notes']);
  const companies = workbook.getWorksheet('Companies')!;
  const matches = workbook.getWorksheet('Product matches')!;
  assert.equal(companies.rowCount - 1, research.companies.length);
  assert.equal(matches.rowCount - 1, research.products.reduce((count, product) => count + product.matches.length, 0));
  const ids = new Set<string>();
  let productCount = 0;
  for (let row = 2; row <= companies.rowCount; row++) {
    const id = cell(companies, row, 'Company ID').text;
    assert.ok(!ids.has(id)); ids.add(id);
    const source = research.companies.find(company => company.id === id)!;
    assert.equal(cell(companies, row, 'Public business email').text, source.email);
    assert.equal(cell(companies, row, 'Public business phone').text, source.phone);
    assert.equal(cell(companies, row, 'Purchasing contact status').text, 'Not verified');
    assert.equal(cell(companies, row, 'Company contact page').hyperlink, source.contactUrl || source.website);
    productCount += Number(cell(companies, row, 'Matching product count').value);
  }
  assert.equal(productCount, research.products.length);
  assert.equal(companies.views[0].state, 'frozen');
  assert.ok(companies.autoFilter);
  const people = workbook.getWorksheet('Contact people')!;
  assert.equal(people.rowCount - 1, research.companies.reduce((total, company) => total + company.contacts.length, 0));
  for (let row = 2; row <= people.rowCount; row++) {
    const company = research.companies.find(company => company.id === cell(people, row, 'Company ID').text)!;
    const source = company.contacts.find(person => person.name === cell(people, row, 'Person').text)!;
    assert.equal(cell(people, row, 'Sourced person email').text, source.email || '');
    assert.equal(cell(people, row, 'Person source').hyperlink, source.url);
    assert.equal(cell(people, row, 'Evidence status').text, source.status);
    assert.equal(cell(people, row, 'Source checked at').text, source.checkedAt);
  }
  assert.equal(workbook.getWorksheet('Contact routes')!.rowCount - 1, research.companies.reduce((total, company) => total + (company.contactRoutes?.length || Number(!!company.email) + Number(!!company.phone)), 0));
});

test('filtered Excel preserves Unicode, text-shaped formulas, buyer verification, unknown percentages and source dates', async () => {
  const company = { ...research.companies[0], name: '=1+1 — गुड़', phone: '00123456789', email: 'hello@example.test' };
  const sourceProduct = research.products.find(product => product.companyId === company.id)!;
  const product: BuyerProduct = {
    ...sourceProduct, name: '+Product\nSecond line', packGrams: null, reviewStatus: 'Needs review',
    matches: [{ ...sourceProduct.matches[0], percent: null, relation: 'compound' }, { ...sourceProduct.matches[0], percent: 16, relation: 'direct' }],
  };
  const workbook = await roundTrip({
    ...base, scope: 'Current results', filters: { Search: 'one company', 'Ingredient family': product.matches[0].family },
    products: [product, product],
    research: { ...research, companies: [company], workspaces: [{
      id: company.id, saved: true, stage: 'Contact verified', notes: '=HYPERLINK("https://example.test")',
      contactName: 'Recorded buyer', contactRole: 'Procurement manager', contactEmail: 'buyer@example.test',
      contactSource: 'https://example.test/team', contactVerifiedAt: '2026-09-29T12:00:00Z', scenarios: [], updatedAt: '',
    }] },
  });
  const companies = workbook.getWorksheet('Companies')!;
  const matches = workbook.getWorksheet('Product matches')!;
  assert.equal(companies.rowCount, 2);
  assert.equal(cell(companies, 2, 'Matching product count').value, 1);
  assert.equal(matches.rowCount, 3);
  assert.equal(cell(companies, 2, 'Company').value, company.name);
  assert.equal(cell(companies, 2, 'Company').type, ExcelJS.ValueType.String);
  assert.equal(cell(companies, 2, 'Public business phone').value, '00123456789');
  assert.equal(cell(companies, 2, 'Public business email').value, 'hello@example.test');
  assert.equal(cell(companies, 2, 'Purchasing contact email').value, 'buyer@example.test');
  assert.equal(cell(companies, 2, 'Purchasing contact status').value, 'Verified by your team');
  assert.equal(cell(companies, 2, 'Purchasing contact source').hyperlink, 'https://example.test/team');
  assert.equal(cell(companies, 2, 'Workspace notes').type, ExcelJS.ValueType.String);
  assert.equal(cell(matches, 2, 'Product').value, product.name);
  assert.equal(cell(matches, 2, 'Published ingredient (%)').value, null);
  assert.equal(cell(matches, 3, 'Published ingredient (%)').value, 16);
  assert.equal(cell(matches, 2, 'Pack weight (g)').value, null);
  assert.equal(cell(matches, 2, 'Match type').value, 'Inside a component');
  assert.equal(cell(matches, 2, 'Product source').hyperlink, product.url);
  assert.equal(cell(matches, 2, 'Source checked at').value, product.checkedAt);
  assert.equal(cell(matches, 2, 'Review status').value, 'Needs review');
  const notes = workbook.getWorksheet('Export notes')!;
  assert.match(cell(notes, 4, 'Details').text, /Search: one company/);
  workbook.worksheets.forEach(sheet => sheet.eachRow(row => row.eachCell(cell => assert.notEqual(cell.type, ExcelJS.ValueType.Formula))));
});

test('empty selected results export no unrelated companies or products', () => {
  const workbook = createBuyerWorkbook({ ...base, products: [], scope: 'Current results' });
  assert.equal(workbook.getWorksheet('Companies')!.rowCount, 1);
  assert.equal(workbook.getWorksheet('Product matches')!.rowCount, 1);
  assert.equal(workbook.getWorksheet('Contact people')!.rowCount, 1);
  assert.equal(workbook.getWorksheet('Contact routes')!.rowCount, 1);
});

test('contact export follows selected companies and keeps named leads separate from general contact routes', async () => {
  const company = research.companies.find(company => company.id === 'true-elements')!;
  const products = research.products.filter(product => product.companyId === company.id).slice(0, 1);
  const workbook = await roundTrip({ ...base, products, scope: 'Current results' });
  const people = workbook.getWorksheet('Contact people')!;
  assert.equal(people.rowCount - 1, company.contacts.length);
  assert.equal(cell(people, 2, 'Person').text, 'Gauri Bhagwat');
  assert.equal(cell(people, 2, 'Sourced person email').text, '');
  assert.equal(cell(people, 2, 'Evidence status').text, 'Published professional lead');
  assert.match(cell(people, 2, 'Corroborating sources').text, /theorg.com/);
  assert.equal(cell(workbook.getWorksheet('Companies')!, 2, 'Purchasing contact status').text, 'Not verified');
  const routes = workbook.getWorksheet('Contact routes')!;
  assert.equal(routes.rowCount - 1, company.contactRoutes!.length);
  for (let row = 2; row <= routes.rowCount; row++) assert.equal(cell(routes, row, 'Company ID').text, company.id);
});
