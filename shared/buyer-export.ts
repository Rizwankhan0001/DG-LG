import ExcelJS from 'exceljs';
import { productTitle } from './catalogue.js';
import { relevantSupplierProducts, type BuyerProduct, type IngredientBootstrap } from './intelligence.js';
import type { Product } from './types.js';
import { contactApproach, sortBuyerContacts } from './buyer-contacts.js';
import { buyerReadiness, companyApproachBrief } from './buyer-readiness.js';

export interface BuyerExportInput {
  research: Pick<IngredientBootstrap, 'companies' | 'products' | 'materials' | 'workspaces'>;
  products: BuyerProduct[];
  catalogue: Product[];
  scope: 'Current results' | 'All companies';
  filters: Record<string, string>;
  exportedAt?: Date;
}

type Column = { header: string; key: string; width: number };
const unique = (values: string[]) => [...new Set(values.filter(Boolean))].join('\n');
const link = (url: string): ExcelJS.CellValue => /^https?:\/\//i.test(url) ? { text: url, hyperlink: url } : url;

function sheet(workbook: ExcelJS.Workbook, name: string, columns: Column[]) {
  const result = workbook.addWorksheet(name, {
    views: [{ state: 'frozen', xSplit: 1, ySplit: 1 }],
    properties: { defaultRowHeight: 54 },
  });
  result.columns = columns;
  result.getRow(1).height = 32;
  result.getRow(1).eachCell(cell => {
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF235642' } };
  });
  return result;
}

/** Real XLSX cells keep source text (including leading =, + and zeroes) as text. */
export function createBuyerWorkbook({ research, products, catalogue, scope, filters, exportedAt = new Date() }: BuyerExportInput) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Dhampur Green';
  workbook.created = exportedAt;
  workbook.modified = exportedAt;
  workbook.title = 'Ingredient matching companies';
  const companyMap = new Map(research.companies.map(company => [company.id, company]));
  const workspaces = new Map(research.workspaces.map(workspace => [workspace.id, workspace]));
  const grouped = new Map<string, BuyerProduct[]>();
  // Use exactly the selected products, with one outreach row per company.
  for (const product of new Map(products.map(product => [product.id, product])).values()) {
    if (!companyMap.has(product.companyId) || !product.matches.length) continue;
    const items = grouped.get(product.companyId) ?? [];
    items.push(product);
    grouped.set(product.companyId, items);
  }

  const companies = sheet(workbook, 'Companies', [
    { header: 'Company', key: 'company', width: 28 },
    { header: 'Ingredient families', key: 'families', width: 27 },
    { header: 'Public business email', key: 'email', width: 32 },
    { header: 'Public business phone', key: 'phone', width: 26 },
    { header: 'Company contact page', key: 'contactUrl', width: 42 },
    { header: 'Purchasing contact name', key: 'buyerName', width: 25 },
    { header: 'Purchasing contact email', key: 'buyerEmail', width: 32 },
    { header: 'Purchasing contact role', key: 'buyerRole', width: 28 },
    { header: 'Purchasing contact status', key: 'buyerStatus', width: 29 },
    { header: 'Roles to ask for', key: 'targetRoles', width: 36 },
    { header: 'Matching product count', key: 'productCount', width: 18 },
    { header: 'Matching products', key: 'products', width: 55 },
    { header: 'Suggested Dhampur products', key: 'supplierProducts', width: 44 },
    { header: 'Company website', key: 'website', width: 38 },
    { header: 'Contact city', key: 'city', width: 24 },
    { header: 'Contact state', key: 'state', width: 20 },
    { header: 'Industry', key: 'industry', width: 28 },
    { header: 'Location source', key: 'locationSource', width: 42 },
    { header: 'Contact details checked at', key: 'contactCheckedAt', width: 26 },
    { header: 'Public contact notes', key: 'contactNote', width: 52 },
    { header: 'Purchasing contact source', key: 'buyerSource', width: 42 },
    { header: 'Purchasing contact verified at', key: 'buyerVerifiedAt', width: 26 },
    { header: 'Stage', key: 'stage', width: 22 },
    { header: 'Saved company', key: 'saved', width: 18 },
    { header: 'Workspace notes', key: 'notes', width: 48 },
    { header: 'Questions for the buyer', key: 'questions', width: 52 },
    { header: 'Reviewed product count', key: 'reviewed', width: 19 },
    { header: 'Products needing review', key: 'needsReview', width: 21 },
    { header: 'Company ID', key: 'companyId', width: 28 },
    { header: 'Published people count', key: 'peopleCount', width: 22 },
    { header: 'Published people', key: 'people', width: 48 },
    { header: 'Marketplace sources', key: 'marketplaces', width: 56 },
    { header: 'Ingredient and contact readiness', key: 'readiness', width: 34 },
    { header: 'Suggested next step', key: 'approach', width: 58 },
    { header: 'Still to confirm', key: 'gaps', width: 50 },
    { header: 'Company approach brief', key: 'brief', width: 70 },
  ]);
  const evidence = sheet(workbook, 'Product matches', [
    { header: 'Company', key: 'company', width: 28 },
    { header: 'Product', key: 'product', width: 44 },
    { header: 'Ingredient family', key: 'family', width: 26 },
    { header: 'Published ingredient term', key: 'term', width: 28 },
    { header: 'Match type', key: 'relation', width: 25 },
    { header: 'Published ingredient (%)', key: 'percent', width: 22 },
    { header: 'Suggested Dhampur products', key: 'supplierProducts', width: 44 },
    { header: 'Dhampur product sources', key: 'supplierUrls', width: 48 },
    { header: 'Product source', key: 'source', width: 52 },
    { header: 'Review status', key: 'reviewStatus', width: 20 },
    { header: 'Source checked at', key: 'checkedAt', width: 26 },
    { header: 'Listing status at check', key: 'listingStatus', width: 24 },
    { header: 'Published ingredient list', key: 'ingredients', width: 70 },
    { header: 'Evidence excerpt', key: 'quote', width: 55 },
    { header: 'Evidence notes', key: 'note', width: 55 },
    { header: 'Evidence source type', key: 'sourceType', width: 23 },
    { header: 'Pack weight (g)', key: 'packGrams', width: 18 },
    { header: 'Pack weight notes', key: 'packNote', width: 44 },
    { header: 'Company ID', key: 'companyId', width: 28 },
    { header: 'Product ID', key: 'productId', width: 30 },
  ]);
  const people = sheet(workbook, 'Contact people', [
    { header: 'Company', key: 'company', width: 28 },
    { header: 'Person', key: 'name', width: 28 },
    { header: 'Published role', key: 'role', width: 44 },
    { header: 'Department', key: 'department', width: 25 },
    { header: 'Sourced person email', key: 'email', width: 34 },
    { header: 'Evidence status', key: 'status', width: 32 },
    { header: 'Source type', key: 'sourceType', width: 26 },
    { header: 'Person source', key: 'url', width: 55 },
    { header: 'Source checked at', key: 'checkedAt', width: 26 },
    { header: 'Evidence and limitations', key: 'evidenceNote', width: 65 },
    { header: 'Suggested approach', key: 'approach', width: 65 },
    { header: 'Corroborating sources', key: 'corroboratingUrls', width: 60 },
    { header: 'Company ID', key: 'companyId', width: 28 },
  ]);
  const routes = sheet(workbook, 'Contact routes', [
    { header: 'Company', key: 'company', width: 28 },
    { header: 'Contact type', key: 'kind', width: 18 },
    { header: 'Business contact', key: 'value', width: 38 },
    { header: 'Published purpose', key: 'purpose', width: 54 },
    { header: 'Contact source', key: 'url', width: 55 },
    { header: 'Source checked at', key: 'checkedAt', width: 26 },
    { header: 'Company ID', key: 'companyId', width: 28 },
  ]);
  for (const [companyId, items] of grouped) {
    const company = companyMap.get(companyId)!;
    const workspace = workspaces.get(companyId);
    const matches = items.flatMap(product => product.matches);
    const buyerVerified = !!workspace?.contactVerifiedAt;
    companies.addRow({
      company: company.name, companyId, families: unique(matches.map(match => match.family)),
      email: company.email, phone: company.phone, contactUrl: link(company.contactUrl || company.website),
      buyerName: workspace?.contactName || '', buyerEmail: workspace?.contactEmail || '',
      buyerRole: workspace?.contactRole || '', buyerStatus: buyerVerified ? 'Verified by your team' : 'Not verified',
      targetRoles: company.targetRoles.join('\n'), productCount: items.length,
      products: unique(items.map(product => product.name)),
      supplierProducts: unique(matches.flatMap(match => relevantSupplierProducts(match, research.materials, catalogue).map(productTitle))),
      website: link(company.website), city: company.city, state: company.state, industry: company.category,
      locationSource: link(company.locationSource), contactCheckedAt: company.contactCheckedAt, contactNote: company.contactNote,
      buyerSource: link(workspace?.contactSource || ''), buyerVerifiedAt: workspace?.contactVerifiedAt || '',
      stage: workspace?.stage || 'Research', saved: workspace?.saved ? 'Yes' : 'No', notes: workspace?.notes || '',
      questions: company.buyingQuestions.join('\n'), reviewed: items.filter(product => product.reviewStatus === 'Reviewed').length,
      needsReview: items.filter(product => product.reviewStatus === 'Needs review').length,
      peopleCount: company.contacts.length,
      people: unique(company.contacts.map(contact => `${contact.name} — ${contact.role}`)),
      marketplaces: unique((company.marketplaces ?? []).map(source => `${source.platform}: ${source.url}\n${source.note} Checked ${source.checkedAt}`)),
      readiness: buyerReadiness(company, items, exportedAt.getTime()).label,
      approach: buyerReadiness(company, items, exportedAt.getTime()).approach,
      gaps: buyerReadiness(company, items, exportedAt.getTime()).gaps.join('\n'), brief: companyApproachBrief(company, items),
    });
    for (const contact of sortBuyerContacts(company.contacts)) people.addRow({
      ...contact, company: company.name, companyId, email: contact.email || '', approach: contactApproach(contact),
      url: link(contact.url), corroboratingUrls: unique(contact.corroboratingUrls ?? []),
      evidenceNote: contact.evidenceNote || 'Confirm current employment and purchasing responsibility.',
    });
    const businessRoutes = company.contactRoutes?.length ? company.contactRoutes : [
      ...(company.email ? [{ kind: 'Email', value: company.email, purpose: company.contactNote, url: company.contactUrl, checkedAt: company.contactCheckedAt }] : []),
      ...(company.phone ? [{ kind: 'Phone', value: company.phone, purpose: company.contactNote, url: company.contactUrl, checkedAt: company.contactCheckedAt }] : []),
    ];
    for (const route of businessRoutes) routes.addRow({ ...route, company: company.name, companyId, url: link(route.url) });
    for (const product of items) for (const match of product.matches) {
      const suppliers = relevantSupplierProducts(match, research.materials, catalogue);
      evidence.addRow({
        company: company.name, product: product.name, companyId, productId: product.id,
        family: match.family, term: match.term, relation: match.relation === 'direct' ? 'Direct ingredient use' : 'Inside a component',
        percent: match.percent, supplierProducts: unique(suppliers.map(productTitle)), supplierUrls: unique(suppliers.map(supplier => supplier.url)),
        source: link(product.url), reviewStatus: product.reviewStatus, checkedAt: product.checkedAt,
        listingStatus: product.status, ingredients: product.ingredients, quote: match.quote, note: match.note,
        sourceType: product.ingredientsSource, packGrams: product.packGrams, packNote: product.packNote,
      });
    }
  }

  const notes = sheet(workbook, 'Export notes', [
    { header: 'Field', key: 'field', width: 32 },
    { header: 'Details', key: 'details', width: 110 },
  ]);
  const productCount = [...grouped.values()].reduce((count, items) => count + items.length, 0);
  notes.addRows([
    { field: 'Exported at (UTC)', details: exportedAt.toISOString() },
    { field: 'Export scope', details: scope },
    { field: 'Applied filters', details: scope === 'All companies' ? 'None — all researched companies with ingredient matches' : Object.entries(filters).filter(([, value]) => value).map(([name, value]) => `${name}: ${value}`).join('\n') || 'None' },
    { field: 'Included records', details: `${grouped.size} companies; ${productCount} products; ${evidence.rowCount - 1} ingredient evidence rows` },
    { field: 'Companies sheet', details: 'One row per company in the selected results. Public business email/phone are separate from the purchasing contact recorded by your team.' },
    { field: 'Product matches sheet', details: 'One row per recorded ingredient match in each selected product. All recorded ingredients are retained, including additional ingredients in products selected by a filter.' },
    { field: 'Outreach preparation', details: 'Use the company contact page or public business contact to ask for the listed purchasing roles. Public contacts may route to customer service; purchasing responsibility and interest need confirmation.' },
    { field: 'Ingredient evidence', details: 'Direct ingredient use and ingredients inside a component are labelled separately. For component matches, confirm whether the company or a component supplier buys the raw material.' },
    { field: 'Unknown quantities', details: 'Blank percentages, weights and contacts are unknown. Listed ingredients do not establish current procurement demand or monthly purchasing volumes.' },
    { field: 'Source dates and review', details: 'Source check dates describe when evidence was checked, not when it was exported. Needs review records remain unverified. Suggested Dhampur products are ingredient-family matches to qualify with the buyer.' },
    { field: 'Company locations', details: 'Cities and states are sourced contact locations, not confirmed factory addresses. Missing or unconfirmed locations retain their original labels.' },
    { field: 'Contact people sheet', details: 'Named public professional leads with source type, check date and limitations. Published roles are not confirmed buying authority. A blank person email means none was found; general company emails are never substituted.' },
    { field: 'Contact routes sheet', details: 'Published business emails and phones with their purposes and source links. Sales, corporate gifting and customer care routes can help request a procurement introduction; they are not automatically purchasing contacts.' },
  ]);
  for (const worksheet of workbook.worksheets) {
    worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: worksheet.rowCount, column: worksheet.columnCount } };
    worksheet.eachRow((row, index) => row.eachCell(cell => {
      cell.alignment = { vertical: 'top', wrapText: true };
      if (index === 1) return;
      cell.font = { size: 11, color: { argb: cell.type === ExcelJS.ValueType.Hyperlink ? 'FF226844' : 'FF17372C' }, underline: cell.type === ExcelJS.ValueType.Hyperlink };
      if (index % 2 === 0) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F6EF' } };
    }));
  }
  return workbook;
}

export async function downloadBuyerExcel(input: BuyerExportInput) {
  const exportedAt = input.exportedAt ?? new Date();
  const workbook = createBuyerWorkbook({ ...input, exportedAt });
  const bytes = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `ingredient-buyers-${input.scope === 'All companies' ? 'all' : 'filtered'}-${exportedAt.toISOString().slice(0, 10)}.xlsx`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Leave time for browsers to finish starting the download before releasing it.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
