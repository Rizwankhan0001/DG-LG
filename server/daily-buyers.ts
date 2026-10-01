import * as cheerio from 'cheerio';
import { createHash } from 'node:crypto';
import type { BuyerCompany, BuyerContact, BuyerContactRoute, BuyerProduct } from '../shared/intelligence.js';
import type { DailyResearchReport } from '../shared/buyer-readiness.js';
import { ingredientSection, matchIngredientText, productFromCatalogue, shopifyProduct } from './ingredient-research.js';
import { canonicalHost, publicHost, type PublicPage } from './public-research-fetch.js';

export interface ResearchSource { id: string; name: string; host: string; category: string; country?: string; productUrls?: string[]; profileUrls?: string[]; discoveryUrl?: string; duplicateOf?: string; excludedContactDomains?: string[]; contactReviewNote?: string }
export interface DailyResearchState { attempts: Record<string, string>; discovered: ResearchSource[]; history: DailyResearchReport[] }
type FetchPage = (url: string) => Promise<PublicPage>;
const tidy = (text: string) => text.replace(/\s+/g, ' ').trim();
const hash = (text: string) => createHash('sha256').update(text).digest('hex').slice(0, 16);
const excludedHosts = /(?:^|\.)(?:amazon\.[a-z.]+|flipkart\.com|bigbasket\.com|blinkit\.com|swiggy\.com|zepto\.com|jiomart\.com|linkedin\.com|facebook\.com|instagram\.com|youtube\.com|pinterest\.com|indiamart\.com|tradeindia\.com|wikipedia\.org|reddit\.com|dhampurgreen\.com)$/;
export function candidateHost(value: string) { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password && !url.port && publicHost(url.hostname) && !excludedHosts.test(url.hostname); } catch { return false; } }
const productPath = (url: string) => /\/(?:products?|product-page)\//.test(new URL(url).pathname) && !/\/(?:blogs?|recipes?|collections)\//.test(new URL(url).pathname);
function sameSite(value: string, base: string) { try { const url = new URL(value, base); return candidateHost(url.href) && canonicalHost(url.href) === canonicalHost(base) ? url.href.split('#')[0] : ''; } catch { return ''; } }

function structured(html: string): Record<string, unknown>[] {
  const $ = cheerio.load(html), values: Record<string, unknown>[] = [];
  function walk(value: unknown, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 8) return;
    if (Array.isArray(value)) { for (const item of value.slice(0, 500)) walk(item, depth + 1); return; }
    const item = value as Record<string, unknown>; values.push(item);
    for (const [key, child] of Object.entries(item)) if (key !== '@context') walk(child, depth + 1);
  }
  $('script[type="application/ld+json"]').each((_, el) => { try { walk(JSON.parse($(el).text())); } catch { /* Malformed metadata is not evidence. */ } });
  return values;
}
const typed = (value: Record<string, unknown>, type: string) => [value['@type']].flat().includes(type);
const textField = (value: unknown) => typeof value === 'string' ? tidy(value) : '';

export function contactDepartment(role: string): BuyerContact['department'] {
  if (/procurement|purchas|sourcing|supply chain/i.test(role)) return 'Procurement';
  if (/research|development|r&d|food technologist/i.test(role)) return 'Product development';
  if (/operation|factory|production|plant manager/i.test(role)) return 'Operations';
  if (/sales|business development/i.test(role)) return 'Sales';
  if (/founder|\bceo\b|chief executive|managing director/i.test(role)) return 'Leadership';
}

export function extractOfficialContacts(page: PublicPage, company: BuyerCompany, checkedAt: string) {
  const $ = cheerio.load(page.text); $('script,style,noscript').remove();
  const routes: BuyerContactRoute[] = [], people: BuyerContact[] = [];
  const addRoute = (kind: BuyerContactRoute['kind'], value: string) => {
    value = value.trim();
    if (kind === 'Email' && (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) || /example|noreply|no-reply|sentry|shopify|shiprocket|godaddy|wixpress/i.test(value))) return;
    if (kind === 'Email' && /^(?:reservations?|careers?|jobs|privacy|dpo|webmaster|emandate)@/i.test(value)) return;
    if (kind === 'Phone' && !/^\+?[\d ()-]{8,24}$/.test(value)) return;
    const key = kind === 'Phone' ? value.replace(/\D/g, '') : value.toLowerCase();
    if (routes.some(r => (r.kind === 'Phone' ? r.value.replace(/\D/g, '') : r.value.toLowerCase()) === key)) return;
    routes.push({ kind, value, purpose: 'Published company contact; ask for ingredient procurement or supplier registration', url: page.url, checkedAt });
  };
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (/^mailto:/i.test(href)) addRoute('Email', href.slice(7).split('?')[0]);
    if (/^tel:/i.test(href)) addRoute('Phone', href.slice(4));
  });
  // Visible addresses only; never guess addresses from a person's name.
  const visibleText = $('body,body *').contents().toArray().filter(node => node.type === 'text').map(node => $(node).text()).join(' ');
  for (const email of (visibleText.match(/[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || []).slice(0, 30)) addRoute('Email', email);
  const values = structured(page.text);
  for (const value of values.filter(v => typed(v, 'Person'))) {
    const name = textField(value.name), role = textField(value.jobTitle), department = contactDepartment(role);
    const worksFor = value.worksFor as Record<string, unknown> | undefined;
    const linkedEmployer = worksFor && (textField(worksFor.name).toLowerCase() === company.name.toLowerCase() || sameSite(textField(worksFor.url), company.website) && !!worksFor.url);
    const founder = values.some(v => typed(v, 'Organization') && (textField(v.name).toLowerCase() === company.name.toLowerCase() || !!v.url && !!sameSite(textField(v.url), company.website)) && [v.founder, v.founders].flat().some(p => p === value));
    if ((!linkedEmployer && !founder) || !department || !/^[\p{L}][\p{L}\p{M} .'-]{2,100}$/u.test(name) || !name.includes(' ')) continue;
    people.push({ name, role, department, url: page.url, sourceType: 'Company website', checkedAt, status: 'Published professional lead',
      evidenceNote: 'Role published in the official website’s structured company information. Confirm current employment and purchasing authority. No personal email inferred.' });
  }
  return { routes, people };
}

export function productFromOfficialPage(company: BuyerCompany, page: PublicPage, checkedAt: string): BuyerProduct | null {
  if (!productPath(page.url)) return null;
  const $ = cheerio.load(page.text), schema = structured(page.text).find(v => typed(v, 'Product'));
  const name = tidy($('h1').first().text()) || textField(schema?.name);
  if (!name || name.length > 220 || /combo|hamper|bundle|assorted|\bkit\b/i.test(name)) return null;
  const ingredients = ingredientSection(company.id, page.text), matches = matchIngredientText(ingredients);
  if (!ingredients || !matches.length) return null;
  const titleMatchesSchema = textField(schema?.name).toLowerCase() === name.toLowerCase();
  const offers = titleMatchesSchema ? schema?.offers : undefined, rows = Array.isArray(offers) ? offers : offers ? [offers] : [];
  const availability = rows.map(row => textField((row as Record<string, unknown>).availability));
  const active = availability.some(v => /\/InStock$/.test(v)) || !availability.length && /add to (?:cart|bag)|buy now/i.test($('button,input[type="submit"]').text());
  const pack = name.match(/\b(\d+(?:\.\d+)?)\s*(kg|g|gm|grams)\b/i);
  return { id: `${company.id}-web-${hash(new URL(page.url).pathname.replace(/\/$/, ''))}`, companyId: company.id, name, url: page.url,
    image: '', imageSource: '', packGrams: pack ? Number(pack[1]) * (pack[2].toLowerCase() === 'kg' ? 1000 : 1) : null,
    packNote: pack ? 'Pack weight from the product title; confirm before estimating demand.' : 'Pack weight not established.',
    ingredients, ingredientsSource: 'Ingredient list', matches, checkedAt, reviewStatus: 'Needs review',
    status: active ? 'Active listing' : availability.some(v => /\/(?:OutOfStock|SoldOut|Discontinued)$/.test(v)) ? 'Unavailable at check' : 'Availability unconfirmed', discoveredBy: 'Catalogue scan' };
}

export function mergePublicContacts(company: BuyerCompany, routes: BuyerContactRoute[], people: BuyerContact[], checkedAt: string) {
  const routeKey = (r: BuyerContactRoute) => `${r.kind}:${r.kind === 'Phone' ? r.value.replace(/\D/g, '').replace(/^91(?=0?\d{10}$)/, '').replace(/^0(?=\d{10}$)/, '') : r.value.toLowerCase()}`;
  const mergedRoutes = [...(company.contactRoutes || [])], contacts = [...company.contacts];
  for (const route of routes) if (!mergedRoutes.some(r => routeKey(r) === routeKey(route))) mergedRoutes.push(route);
  for (const person of people) if (!contacts.some(p => p.name.toLowerCase() === person.name.toLowerCase())) contacts.push(person);
  const addedRoutes = mergedRoutes.length - (company.contactRoutes || []).length, addedPeople = contacts.length - company.contacts.length;
  if (!addedRoutes && !addedPeople) return { company, addedRoutes, addedPeople };
  const preferredEmail = mergedRoutes.find(r => r.kind === 'Email' && r.value.split('@')[1]?.toLowerCase() === canonicalHost(company.website)) || mergedRoutes.find(r => r.kind === 'Email');
  return { company: { ...company, contactRoutes: mergedRoutes, contacts,
    email: company.email || preferredEmail?.value || '', phone: company.phone || mergedRoutes.find(r => r.kind === 'Phone')?.value || '',
    contactUrl: company.contactUrl || routes[0]?.url || '', contactCheckedAt: company.contactCheckedAt || checkedAt, researchUpdatedAt: checkedAt }, addedRoutes, addedPeople };
}

function companyFor(source: ResearchSource): BuyerCompany {
  return { id: source.id, name: source.name, website: `https://${source.host}`, city: 'Location to confirm', state: '', locationSource: '', category: source.category,
    description: 'Published food product ingredients match the supplier catalogue. Confirm the manufacturing company and raw-material buying team.',
    contactUrl: '', email: '', phone: '', contactCheckedAt: '', contactNote: 'Public company route; purchasing authority and demand are unconfirmed.', contacts: [], contactRoutes: [],
    targetRoles: ['Ingredient procurement / purchase manager', 'Product development / R&D manager', 'Operations / factory manager'],
    buyingQuestions: ['Who purchases the raw materials: your company or a contract manufacturer?', 'Who approves ingredient suppliers and sample trials?', 'Which grade, delivery location, monthly quantity and certifications do you require?'] };
}

export async function inspectResearchSource(source: ResearchSource, fetchPage: FetchPage, checkedAt: string, existing?: BuyerCompany) {
  let company = existing || companyFor(source);
  const pages: PublicPage[] = [], products: BuyerProduct[] = [], warnings: string[] = [];
  const ownBrandProducts = new Set<string>();
  const ownBrand = (name: string) => {
    const normalized = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '');
    return !!name && [company.name, canonicalHost(company.website).split('.')[0]].some(value => normalized(value) === normalized(name));
  };
  const read = async (url: string) => { try { const page = await fetchPage(url); pages.push(page); return page; } catch (e) { warnings.push((e as Error).message); return null; } };
  const home = await read(company.website);
  if (!home) return { company, products, warnings, addedRoutes: 0, addedPeople: 0, qualifies: false };
  company = { ...company, website: new URL(home.url).origin };
  const $ = cheerio.load(home.text), links = $('a[href]').toArray().map(el => sameSite($(el).attr('href') || '', home.url)).filter(Boolean);
  if (source.id.startsWith('web-')) {
    const publishedName = tidy($('meta[property="og:site_name"]').attr('content') || '');
    if (publishedName.length >= 2 && publishedName.length <= 120) company = { ...company, name: publishedName };
  }
  const profileUrls = [...new Set([...(source.profileUrls || []), ...links.filter(url => /\b(?:contact|about|team|our-story|leadership)\b/i.test(new URL(url).pathname))])].filter(url => sameSite(url, home.url)).slice(0, 4);
  for (const url of profileUrls) await read(url);
  const feed = await read(`${company.website}/products.json?limit=250`);
  const pageUrls = new Set((source.productUrls || []).filter(url => sameSite(url, home.url)));
  if (feed) {
    try {
      const data = JSON.parse(feed.text) as { products?: unknown[] };
      for (const raw of (data.products || []).slice(0, 250)) {
        const parsed = shopifyProduct.safeParse(raw); if (!parsed.success) continue;
        const product = productFromCatalogue(company, parsed.data, checkedAt);
        if (product) { products.push(product); if (ownBrand(textField((raw as Record<string, unknown>).vendor))) ownBrandProducts.add(product.id); }
        else if (/jaggery|khand|cookie|chocolate|granola|muesli|chikki|ladoo|laddu|biscuit|bar\b/i.test(parsed.data.title) && pageUrls.size < 10) pageUrls.add(`${company.website}/products/${parsed.data.handle}`);
      }
    } catch { warnings.push('No usable public catalogue feed; checked individual product pages.'); }
  }
  for (const url of links.filter(productPath).slice(0, 10)) if (pageUrls.size < 10) pageUrls.add(url);
  if (!existing || products.length < 3) for (const url of [...pageUrls].slice(0, 10)) {
    if (products.some(p => p.url.replace(/\/$/, '') === url.replace(/\/$/, ''))) continue;
    const page = await read(url); if (page) { const product = productFromOfficialPage(company, page, checkedAt); if (product) {
      products.push(product);
      const schema = structured(page.text).find(value => typed(value, 'Product'));
      const brand = schema?.brand;
      if (ownBrand(textField(typeof brand === 'object' && brand ? (brand as Record<string, unknown>).name : brand))) ownBrandProducts.add(product.id);
    } }
  }
  const contacts = pages.filter(p => !p.url.includes('/products.json')).map(page => extractOfficialContacts(page, company, checkedAt));
  const excludedDomains = new Set((source.excludedContactDomains || []).map(domain => domain.toLowerCase()));
  const routes = contacts.flatMap(c => c.routes).filter(route => route.kind !== 'Email' || !excludedDomains.has(route.value.split('@')[1].toLowerCase()));
  const merged = mergePublicContacts(company, routes, contacts.flatMap(c => c.people), checkedAt);
  company = merged.company;
  if (!existing && company.contactRoutes?.length) company = { ...company, contactCheckedAt: checkedAt, contactUrl: company.contactRoutes[0].url };
  const isIndia = source.country === 'India' || pages.some(p => /\bIndia\b|\+91[\s()-]*\d{5}/i.test(cheerio.load(p.text).text()));
  const usable = products.filter(p => (!source.id.startsWith('web-') || ownBrandProducts.has(p.id)) && !/^(?:organic |natural |pure )*(?:jaggery|khandsari|khand|sugar)(?: powder| cubes?| blocks?)?(?:\s*[-|,\d(]|$)/i.test(p.name));
  const qualifies = isIndia && !!company.contactRoutes?.length && usable.some(p => p.status === 'Active listing' && p.ingredientsSource === 'Ingredient list' && p.matches.some(m => m.relation === 'direct'));
  return { company, products: usable, warnings, addedRoutes: merged.addedRoutes, addedPeople: merged.addedPeople, qualifies };
}

export async function runDailyBuyerResearch(input: { companies: BuyerCompany[]; products: BuyerProduct[]; sources: ResearchSource[]; state: DailyResearchState; fetchPage: FetchPage; now: string; target?: number; maxCandidates?: number; searchConfigured?: boolean; onProgress?: (message: string) => void }) {
  const { now, fetchPage } = input, day = new Date(now).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const state: DailyResearchState = structuredClone(input.state), companies = new Map(input.companies.map(c => [c.id, c])), products = new Map(input.products.map(p => [p.id, p]));
  const knownHosts = new Set(input.companies.map(c => canonicalHost(c.website))), urls = new Set(input.products.map(p => p.url.replace(/\/$/, '')));
  const earlier = state.history.find(r => r.day === day);
  const report: DailyResearchReport = { day, startedAt: now, finishedAt: now, target: input.target ?? 10, addedCompanies: earlier?.addedCompanies || [], addedProducts: earlier?.addedProducts || 0, addedPeople: earlier?.addedPeople || 0, addedRoutes: earlier?.addedRoutes || 0, enrichedCompanies: 0, candidatesChecked: 0, requests: 0, searchRequests: 0, searchConfigured: !!input.searchConfigured, shortfall: 0, status: 'shortfall', warnings: [], outcomes: [], schedule: 'Daily at 09:15 IST (scheduled runs can be delayed)', workflowUrl: 'https://github.com/Rizwankhan0001/DG-LG/actions/workflows/daily-buyers.yml' };
  if (!input.searchConfigured) report.warnings.push('Web discovery is not connected. Checking the registered company backlog; add TAVILY_API_KEY to GitHub Actions secrets for broader discovery.');
  const seen = new Set<string>();
  const sources = [...input.sources, ...state.discovered].filter(s => { if (!candidateHost(`https://${s.host}`) || s.duplicateOf || !/^[a-z0-9-]+$/.test(s.id)) return false; const host = canonicalHost(s.host); if (seen.has(host)) return false; seen.add(host); return true; })
    .sort((a, b) => Number(knownHosts.has(canonicalHost(a.host))) - Number(knownHosts.has(canonicalHost(b.host))) || (state.attempts[canonicalHost(a.host)] || '').localeCompare(state.attempts[canonicalHost(b.host)] || '') || Number(!!b.productUrls?.length) - Number(!!a.productUrls?.length) || a.name.localeCompare(b.name));
  let enriched = 0;
  const contactRefresh = sources.filter(s => knownHosts.has(canonicalHost(s.host))).slice(0, 3);
  const ordered = [...contactRefresh, ...sources.filter(s => !contactRefresh.includes(s))];
  for (const source of ordered) {
    if (report.candidatesChecked >= (input.maxCandidates ?? 35)) break;
    const host = canonicalHost(source.host), existing = [...companies.values()].find(c => canonicalHost(c.website) === host);
    if (!existing && report.addedCompanies.length >= report.target || existing && enriched >= 6) continue;
    if (state.attempts[host] && Date.parse(now) - Date.parse(state.attempts[host]) < 6 * 86400000) continue;
    if (!existing && companies.has(source.id)) { report.outcomes.push({ company: source.name, host, result: 'Skipped: company identifier belongs to another domain.' }); continue; }
    report.candidatesChecked++; state.attempts[host] = now;
    try {
      const result = await inspectResearchSource(source, fetchPage, now, existing);
      if (result.warnings.includes('Daily public-page request limit reached.')) {
        delete state.attempts[host]; report.warnings.push('Public-page budget exhausted; unprocessed candidates remain eligible for the next run.');
        report.outcomes.push({ company: source.name, host, result: 'Deferred to next run: public-page request budget reached.' }); break;
      }
      if (!existing && !result.qualifies) { report.outcomes.push({ company: source.name, host, result: `Held for review: needs active direct ingredient evidence, India evidence and a published business route.${result.warnings.length ? ` ${result.warnings[0]}` : ''}` }); continue; }
      if (knownHosts.has(canonicalHost(result.company.website)) && !existing) { report.outcomes.push({ company: source.name, host, result: 'Skipped: official domain already represented.' }); continue; }
      companies.set(result.company.id, result.company); knownHosts.add(canonicalHost(result.company.website));
      let added = 0;
      for (const product of result.products) {
        if (products.has(product.id) || urls.has(product.url.replace(/\/$/, ''))) continue;
        products.set(product.id, product); urls.add(product.url.replace(/\/$/, '')); added++;
      }
      report.addedProducts += added; report.addedRoutes += result.addedRoutes; report.addedPeople += result.addedPeople;
      if (!existing) report.addedCompanies.push({ id: result.company.id, name: result.company.name, website: result.company.website, products: added });
      else { enriched++; if (added || result.addedRoutes || result.addedPeople) report.enrichedCompanies++; }
      report.outcomes.push({ company: source.name, host, result: `${existing ? 'Rechecked' : 'Added'}: ${added} new products, ${result.addedRoutes} new business routes, ${result.addedPeople} new named people.` });
    } catch (e) { report.outcomes.push({ company: source.name, host, result: `Source failed; previous research preserved. ${(e as Error).message}` }); }
    finally { input.onProgress?.(`${source.name}: ${report.outcomes.at(-1)?.result}`); }
  }
  report.shortfall = Math.max(0, report.target - report.addedCompanies.length); report.status = report.shortfall ? 'shortfall' : 'target-met';
  if (report.shortfall) report.warnings.push(`${report.shortfall} below the daily target. Unqualified candidates and duplicate firms were not counted.`);
  return { companies: [...companies.values()], products: [...products.values()], state, report };
}
