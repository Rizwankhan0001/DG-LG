import { existsSync, readFileSync, renameSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { BuyerCompany, BuyerProduct } from '../shared/intelligence.js';
import { candidateHost, runDailyBuyerResearch, type DailyResearchState, type ResearchSource } from '../server/daily-buyers.js';
import { canonicalHost, createPublicFetcher } from '../server/public-research-fetch.js';
import { recheckPersonSource, type PersonSource } from '../server/curated-people.js';

// Public source files only. Never load .env or the private CRM database.
const read = <T>(name: string): T => JSON.parse(readFileSync(`data/${name}.json`, 'utf8'));
const atomic = (name: string, value: unknown) => { const path = `data/${name}.json`; writeFileSync(`${path}.partial`, JSON.stringify(value, null, 2) + '\n'); renameSync(`${path}.partial`, path); };
const integer = (name: string, fallback: number, max: number) => { const value = process.env[name]; if (!value) return fallback; const n = Number(value); if (!Number.isInteger(n) || n < 1 || n > max) throw new Error(`${name} must be an integer between 1 and ${max}.`); return n; };
const now = new Date().toISOString();
const state: DailyResearchState = existsSync('data/daily-research-state.json') ? read('daily-research-state') : { attempts: {}, discovered: [], history: [] };
const companies = read<BuyerCompany[]>('buyer-companies'), products = read<BuyerProduct[]>('buyer-products');
const sources = read<ResearchSource[]>('buyer-sources');
const extra = existsSync('data/daily-research-sources.json') ? read<ResearchSource[]>('daily-research-sources') : [];
const warnings: string[] = [];
let searchRequests = 0;
if (process.env.TAVILY_API_KEY) {
  const terms = ['jaggery cookies ingredients manufacturer India', 'khandsari chocolate ingredients brand India', 'jaggery granola muesli ingredients India', 'brown sugar bakery biscuits ingredients India', 'jaggery chikki laddu manufacturer contact India', 'molasses treacle food ingredients India', 'palm jaggery snacks ingredients manufacturer India'];
  const offset = Math.floor(Date.now() / 86400000) % terms.length;
  for (let i = 0; i < integer('DAILY_BUYER_SEARCH_LIMIT', 4, 10); i++) {
    searchRequests++;
    try {
      const response = await fetch('https://api.tavily.com/search', { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(25000), headers: { Authorization: `Bearer ${process.env.TAVILY_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: terms[(offset + i) % terms.length], topic: 'general', country: 'india', search_depth: 'basic', max_results: 20, include_answer: false, include_raw_content: false, include_images: false, auto_parameters: false }) });
      if (!response.ok) throw new Error(`Search returned HTTP ${response.status}; check provider access and quota.`);
      const raw = await response.text(); if (raw.length > 2_000_000) throw new Error('Search response too large.');
      const parsed = z.object({ results: z.array(z.object({ url: z.string().url(), title: z.string() })).max(30) }).parse(JSON.parse(raw));
      for (const item of parsed.results) {
        if (!candidateHost(item.url)) continue;
        const host = new URL(item.url).hostname, id = `web-${canonicalHost(host).replace(/[^a-z0-9]+/g, '-')}`;
        const existing = [...sources, ...extra, ...state.discovered].find(s => canonicalHost(s.host) === canonicalHost(host));
        if (existing) { if (/\/products?\//.test(new URL(item.url).pathname)) existing.productUrls = [...new Set([...(existing.productUrls || []), item.url])].slice(0, 12); continue; }
        // Search snippets are discovery only. The domain identifies the candidate
        // until an official page supplies evidence; no ingredients/persons inferred.
        state.discovered.push({ id, name: canonicalHost(host), host, category: 'Food company · category to confirm', discoveryUrl: item.url,
          productUrls: /\/(?:products?|product-page)\//.test(new URL(item.url).pathname) ? [item.url] : [] });
      }
    } catch (e) { warnings.push((e as Error).message); }
  }
}
const fetcher = createPublicFetcher(integer('DAILY_BUYER_PAGE_LIMIT', 300, 600));
const fetchEvidence = async (url: string) => {
  const page = await fetcher.get(url);
  // Public evidence only; retained as an Actions artifact for review.
  mkdirSync('.research-cache/daily', { recursive: true });
  const key = createHash('sha256').update(page.url).digest('hex');
  writeFileSync(`.research-cache/daily/${key}.json`, JSON.stringify({ url: page.url, checkedAt: now, text: page.text }));
  return page;
};
const peopleSources = existsSync('data/buyer-people-sources.json') ? read<PersonSource[]>('buyer-people-sources') : [];
let namedPeopleAdded = 0;
for (const source of peopleSources.slice(0, 30)) {
  const company = companies.find(c => c.id === source.companyId);
  if (!company || company.contacts.some(p => p.name.toLowerCase() === source.name.toLowerCase())) continue;
  try {
    const page = await fetchEvidence(source.url), person = recheckPersonSource(source, company, page, now);
    if (!person) { warnings.push(`${company.name}: named contact evidence could not be reconfirmed.`); continue; }
    company.contacts.push(person); company.researchUpdatedAt = now; namedPeopleAdded++;
  } catch { warnings.push(`${company.name}: named contact source unavailable; retained previous research.`); }
}
const result = await runDailyBuyerResearch({ companies, products, sources: [...extra, ...sources], state, fetchPage: fetchEvidence,
  now, target: integer('DAILY_BUYER_TARGET', 10, 50), maxCandidates: integer('DAILY_BUYER_CANDIDATE_LIMIT', 35, 100), searchConfigured: !!process.env.TAVILY_API_KEY, onProgress: console.log });
result.report.finishedAt = new Date().toISOString(); result.report.requests = fetcher.requests; result.report.searchRequests = searchRequests; result.report.warnings.push(...warnings);
result.report.addedPeople += namedPeopleAdded;
result.state.history = [result.report, ...result.state.history.filter(r => r.day !== result.report.day)].slice(0, 30);
result.state.discovered = result.state.discovered.slice(-2000);
const ids = new Set(result.companies.map(c => c.id));
if (ids.size !== result.companies.length || new Set(result.products.map(p => p.id)).size !== result.products.length) throw new Error('Duplicate identifiers; research was not written.');
for (const p of result.products) if (!ids.has(p.companyId) || !p.ingredients || !p.matches.length || !p.url.startsWith('https://')) throw new Error('Invalid product evidence; research was not written.');
// Existing product evidence (including reviewed labels) must remain byte-for-byte unchanged.
for (const p of products) if (JSON.stringify(result.products.find(item => item.id === p.id)) !== JSON.stringify(p)) throw new Error('Existing product evidence changed; research was not written.');
atomic('buyer-companies', result.companies); atomic('buyer-products', result.products);
atomic('daily-research-report', result.report); atomic('daily-research-state', result.state);
const lines = [`# Daily company research: ${result.report.day}`, '', `Target: ${result.report.target} new firms. Added today: ${result.report.addedCompanies.length}. Shortfall: ${result.report.shortfall}.`,
  `${result.report.addedProducts} new products, ${result.report.addedPeople} named people and ${result.report.addedRoutes} business routes added today.`, '', ...result.report.warnings.map(w => `- ${w}`), '', ...result.report.outcomes.map(r => `- ${r.company}: ${r.result}`), '', 'All new evidence needs review. Product use is not confirmed buying interest.'];
writeFileSync('data/DAILY_RESEARCH.md', lines.join('\n') + '\n');
if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, lines.join('\n') + '\n', { flag: 'a' });
console.log(`Daily research: ${result.report.addedCompanies.length}/${result.report.target} new firms; ${result.report.shortfall} shortfall; ${fetcher.requests} public requests.`);
