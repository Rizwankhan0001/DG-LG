import * as cheerio from 'cheerio';
import type { BuyerCompany, BuyerContact } from '../shared/intelligence.js';
import { canonicalHost, type PublicPage } from './public-research-fetch.js';
export interface PersonSource { companyId: string; name: string; role: string; department?: BuyerContact['department']; url: string; email?: string; evidence: string[]; evidenceNote: string }

/** Recheck manually researched name/role associations; never infer them from a snippet. */
export function recheckPersonSource(source: PersonSource, company: BuyerCompany, page: PublicPage, checkedAt: string): BuyerContact | null {
  if (company.id !== source.companyId || canonicalHost(company.website) !== canonicalHost(page.url) || page.url.split('#')[0] !== source.url.split('#')[0] || !source.evidence.length) return null;
  const $ = cheerio.load(page.text); $('script,style,noscript').remove();
  const text = $.text().replace(/\s+/g, ' ').toLowerCase();
  if (!source.evidence.every(phrase => text.includes(phrase.replace(/\s+/g, ' ').toLowerCase()))) return null;
  if (source.email && (!source.evidence.includes(source.email) || !text.includes(source.email.toLowerCase()))) return null;
  return { name: source.name, role: source.role, department: source.department, url: page.url, email: source.email, sourceType: 'Company website', status: 'Published professional lead', checkedAt, evidenceNote: source.evidenceNote };
}
