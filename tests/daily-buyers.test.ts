import test from 'node:test';
import assert from 'node:assert/strict';
import { extractOfficialContacts, mergePublicContacts, productFromOfficialPage, runDailyBuyerResearch, candidateHost, type ResearchSource } from '../server/daily-buyers.js';
import { publicAddress, publicHost } from '../server/public-research-fetch.js';
import { buyerReadiness, companyApproachBrief } from '../shared/buyer-readiness.js';
import type { BuyerCompany, BuyerProduct } from '../shared/intelligence.js';
import { recheckPersonSource, type PersonSource } from '../server/curated-people.js';

const now = '2026-10-01T03:45:00.000Z';
const company: BuyerCompany = { id: 'fixture-foods', name: 'Fixture Foods', website: 'https://fixturefoods.in', category: 'Cookies', city: 'Location to confirm', state: '', locationSource: '', description: 'Fixture', contactUrl: '', email: '', phone: '', contactCheckedAt: '', contactNote: '', contacts: [], targetRoles: ['Procurement manager'], buyingQuestions: ['Who purchases the raw materials?'] };
const source: ResearchSource = { id: company.id, name: company.name, host: 'fixturefoods.in', category: company.category, country: 'India' };
const feed = JSON.stringify({ products: [{ id: 17, title: 'Jaggery Cookies 200g', handle: 'jaggery-cookies', body_html: '<p>Ingredients: Whole wheat flour, jaggery powder, butter, salt.</p>', variants: [{ title: '200g', available: true }] }] });
const page = (contact = true) => `<h1>Fixture Foods</h1><p>India</p>${contact ? '<a href="mailto:hello@fixturefoods.in">Contact our business</a><a href="tel:+919876543210">Call</a>' : ''}`;
const fetcher = (contact = true) => async (url: string) => ({ url, text: url.includes('/products.json') ? feed : page(contact) });
const emptyState = () => ({ attempts: {}, discovered: [], history: [] });

test('daily qualification requires direct ingredients, India evidence and an actual business contact', async () => {
  const good = await runDailyBuyerResearch({ companies: [], products: [], sources: [source], state: emptyState(), fetchPage: fetcher(), now });
  assert.equal(good.companies.length, 1); assert.equal(good.report.addedCompanies.length, 1); assert.equal(good.report.shortfall, 9);
  assert.equal(good.products[0].reviewStatus, 'Needs review'); assert.equal(good.companies[0].contacts.length, 0);
  const noContact = await runDailyBuyerResearch({ companies: [], products: [], sources: [source], state: emptyState(), fetchPage: fetcher(false), now });
  assert.equal(noContact.companies.length, 0); assert.equal(noContact.report.addedCompanies.length, 0);
  const foreign = await runDailyBuyerResearch({ companies: [], products: [], sources: [{ ...source, country: undefined }], state: emptyState(), fetchPage: async url => ({ url, text: url.includes('/products.json') ? feed : '<a href="mailto:hello@fixturefoods.in">Email</a>' }), now });
  assert.equal(foreign.companies.length, 0);
});

test('duplicate domains, repeat runs and existing products never inflate the new-company target', async () => {
  const first = await runDailyBuyerResearch({ companies: [], products: [], sources: [source, { ...source, id: 'duplicate', host: 'www.fixturefoods.in' }], state: emptyState(), fetchPage: fetcher(), now, target: 1 });
  assert.equal(first.report.addedCompanies.length, 1); assert.equal(first.report.status, 'target-met');
  const reviewed = first.products.map(p => ({ ...p, reviewStatus: 'Reviewed' as const }));
  first.state.history = [first.report];
  const repeat = await runDailyBuyerResearch({ companies: first.companies, products: reviewed, sources: [source], state: first.state, fetchPage: async () => { throw new Error('Should use daily state.'); }, now, target: 1 });
  assert.equal(repeat.report.addedCompanies.length, 1); assert.equal(repeat.report.candidatesChecked, 0); assert.deepEqual(repeat.products, reviewed);
});

test('failed sources preserve reviewed products and published people', async () => {
  const seeded = await runDailyBuyerResearch({ companies: [], products: [], sources: [source], state: emptyState(), fetchPage: fetcher(), now });
  const result = await runDailyBuyerResearch({ companies: seeded.companies, products: seeded.products, sources: [source], state: emptyState(), fetchPage: async () => { throw new Error('HTTP 503'); }, now });
  assert.deepEqual(result.companies, seeded.companies); assert.deepEqual(result.products, seeded.products); assert.equal(result.report.addedCompanies.length, 0);
});

test('public network fetch rejects local addresses, credentials and marketplace seller URLs', () => {
  for (const ip of ['127.0.0.1', '10.1.2.3', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.0.1', '::1', '::ffff:127.0.0.1', '0.0.0.0', '224.0.0.1']) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress('93.184.216.34'), true);
  assert.equal(publicHost('localhost'), false); assert.equal(publicHost('127.0.0.1'), false);
  for (const url of ['http://fixturefoods.in', 'https://user:password@fixturefoods.in', 'https://fixturefoods.in:444', 'https://amazon.in/product/17', 'https://in.linkedin.com/in/person']) assert.equal(candidateHost(url), false, url);
});

test('person extraction requires explicit employer/role evidence and never assigns a company email', () => {
  const html = page() + `<script type="application/ld+json">${JSON.stringify({ '@graph': [
    { '@type': 'Person', name: 'Asha Shah', jobTitle: 'Procurement Manager', worksFor: { name: company.name } },
    { '@type': 'Person', name: 'Other Person', jobTitle: 'CEO', worksFor: { name: 'Other Foods' } },
    { '@type': 'Person', name: 'Article Author', jobTitle: 'Sales Manager' },
  ] })}</script>`;
  const result = extractOfficialContacts({ url: company.website + '/team', text: html }, company, now);
  assert.equal(result.people.length, 1); assert.equal(result.people[0].name, 'Asha Shah'); assert.equal(result.people[0].email, undefined);
  assert.equal(result.people[0].status, 'Published professional lead'); assert.equal(result.routes[0].value, 'hello@fixturefoods.in');
});

test('contact refresh deduplicates formatted phone numbers and retains sourced details and dates', () => {
  const original = { ...company, email: 'buyer@fixturefoods.in', contactRoutes: [{ kind: 'Phone' as const, value: '+91 98765 43210', purpose: 'Official sales number', url: company.website, checkedAt: '2026-09-01' }] };
  const incoming = extractOfficialContacts({ url: company.website, text: page() }, company, now);
  const merged = mergePublicContacts(original, incoming.routes, [], now);
  assert.equal(merged.addedRoutes, 1); assert.equal(merged.company.email, original.email);
  assert.deepEqual(merged.company.contactRoutes![0], original.contactRoutes[0]);
  const landline = mergePublicContacts({ ...company, contactRoutes: [{ kind: 'Phone', value: '011-4700-6700', purpose: 'Company', url: company.website, checkedAt: now }] },
    [{ kind: 'Phone', value: '+91-11-47006700', purpose: 'Company', url: company.website, checkedAt: now }], [], now);
  assert.equal(landline.addedRoutes, 0);
});

test('reviewed unrelated domains and reservation or mandate mailboxes are excluded from business routes', async () => {
  const result = await runDailyBuyerResearch({ companies: [], products: [], sources: [{ ...source, excludedContactDomains: ['hotel.in'] }], state: emptyState(), now,
    fetchPage: async url => ({ url, text: url.includes('/products.json') ? feed : page() + '<a href="mailto:hello@hotel.in">Hotel</a><a href="mailto:emandate@fixturefoods.in">Payments</a><a href="mailto:reservations@fixturefoods.in">Reservations</a>' }) });
  assert.deepEqual(result.companies[0].contactRoutes?.filter(r => r.kind === 'Email').map(r => r.value), ['hello@fixturefoods.in']);
});

test('product page parser excludes recipes and keeps absent availability out of qualified matches', () => {
  const text = '<h1>Jaggery Cookies</h1><p>Ingredients: Flour, jaggery, butter, salt.</p>';
  assert.equal(productFromOfficialPage(company, { url: company.website + '/blog/recipe', text }, now), null);
  const product = productFromOfficialPage(company, { url: company.website + '/products/cookies', text }, now)!;
  assert.equal(product.status, 'Availability unconfirmed'); assert.equal(product.reviewStatus, 'Needs review');
  assert.equal(product.matches[0].family, 'Cane jaggery');
});

test('visible contact blocks do not join email addresses to neighbouring phone labels', () => {
  const contacts = extractOfficialContacts({ url: company.website, text: '<div><span>hello@fixturefoods.in</span><span>Ph:</span><span>+91 99999 99999</span></div>' }, company, now);
  assert.equal(contacts.routes[0].value, 'hello@fixturefoods.in');
});

test('visible product identity takes precedence over copied structured metadata', () => {
  const text = '<h1>Oats Jaggery Cookies</h1><p>Ingredients: Oats, jaggery, butter, salt.</p>' +
    `<script type="application/ld+json">${JSON.stringify({ '@type': 'Product', name: 'Different Cookies', offers: { availability: 'https://schema.org/InStock' } })}</script>`;
  const product = productFromOfficialPage(company, { url: company.website + '/products/oats-cookies', text }, now)!;
  assert.equal(product.name, 'Oats Jaggery Cookies');
  assert.equal(product.status, 'Availability unconfirmed');
});

test('web-discovered retailers cannot qualify with another company’s branded products', async () => {
  const discovered = { ...source, id: 'web-fixturefoods-in' };
  const makeFeed = (vendor: string) => { const data = JSON.parse(feed); data.products[0].vendor = vendor; return JSON.stringify(data); };
  const run = (vendor: string) => runDailyBuyerResearch({ companies: [], products: [], sources: [discovered], state: emptyState(), now,
    fetchPage: async url => ({ url, text: url.includes('/products.json') ? makeFeed(vendor) : page() }) });
  assert.equal((await run('Another Brand')).companies.length, 0);
  assert.equal((await run('Fixture Foods')).companies.length, 1);
});

test('readiness and approach brief distinguish a business route from a purchasing person', async () => {
  const data = await runDailyBuyerResearch({ companies: [], products: [], sources: [source], state: emptyState(), fetchPage: fetcher(), now });
  const readiness = buyerReadiness(data.companies[0], data.products, Date.parse(now));
  assert.equal(readiness.label, 'Ingredient + contact found'); assert.equal(readiness.person, undefined);
  assert.ok(readiness.gaps.includes('Identify the purchasing person'));
  const brief = companyApproachBrief(data.companies[0], data.products);
  assert.match(brief, /General business email: hello@fixturefoods.in/); assert.match(brief, /Ask for: Ingredient procurement/);
  const unavailable = buyerReadiness(data.companies[0], data.products.map(p => ({ ...p, status: 'Source unavailable' as BuyerProduct['status'] })), Date.parse(now));
  assert.equal(unavailable.label, 'More evidence needed');
});

test('curated people require their reviewed role evidence on the exact official source', () => {
  const source: PersonSource = { companyId: company.id, name: 'Asha Shah', role: 'Procurement Manager', url: company.website + '/team', evidence: ['Asha Shah — Procurement Manager'], evidenceNote: 'Confirm role.' };
  const page = { url: source.url, text: '<p>Asha Shah — Procurement Manager</p>' };
  assert.equal(recheckPersonSource(source, company, page, now)?.name, source.name);
  assert.equal(recheckPersonSource(source, company, { ...page, text: '<p>Asha Shah left the company.</p>' }, now), null);
  assert.equal(recheckPersonSource(source, company, { ...page, url: 'https://unrelated.in/team' }, now), null);
  assert.equal(recheckPersonSource({ ...source, email: 'guess@fixturefoods.in' }, company, page, now), null);
});
