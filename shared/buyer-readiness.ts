import type { BuyerCompany, BuyerProduct } from './intelligence.js';
import { companyEvidenceDate, contactApproach, sortBuyerContacts } from './buyer-contacts.js';

/** A research completeness signal, never purchase intent or a conversion prediction. */
export function buyerReadiness(company: BuyerCompany, products: BuyerProduct[], now = Date.now()) {
  const direct = products.filter(p => p.status === 'Active listing' && p.matches.some(m => m.relation === 'direct'));
  const labels = direct.filter(p => p.ingredientsSource === 'Ingredient list');
  const person = sortBuyerContacts(company.contacts)[0];
  const routes = company.contactRoutes ?? [];
  const email = company.email || routes.find(r => r.kind === 'Email')?.value;
  const phone = company.phone || routes.find(r => r.kind === 'Phone')?.value;
  const contactDate = Math.max(0, ...routes.map(r => Date.parse(r.checkedAt) || 0), Date.parse(company.contactCheckedAt) || 0);
  const fresh = contactDate > 0 && now - contactDate < 90 * 86400000;
  const reachable = !!(email || phone);
  const score = (labels.length ? 40 : direct.length ? 20 : 0) + (reachable ? 20 : 0)
    + (person ? ['Procurement', 'Product development'].includes(person.department || '') ? 25 : 10 : 0)
    + (fresh ? 10 : 0) + (direct.some(p => p.reviewStatus === 'Reviewed') ? 5 : 0);
  const gaps = [!labels.length && 'Check the current ingredient label', !reachable && 'Find a published business contact',
    !person && 'Identify the purchasing person', !fresh && 'Recheck contact details', 'Confirm factory, buying authority and monthly demand'].filter(Boolean) as string[];
  return { score, person, email, phone, fresh, direct: direct.length, labels: labels.length,
    checkedAt: companyEvidenceDate(company, products),
    label: labels.length && reachable ? 'Ingredient + contact found' : 'More evidence needed',
    approach: person ? contactApproach(person) : 'Use the company contact route to ask who handles ingredient procurement and supplier approval.',
    gaps };
}

export function companyApproachBrief(company: BuyerCompany, products: BuyerProduct[]) {
  const readiness = buyerReadiness(company, products);
  const example = products.find(p => p.status === 'Active listing' && p.matches.some(m => m.relation === 'direct')) || products[0];
  return [`${company.name} — ingredient supplier introduction`,
    example ? `Product evidence: ${example.name}\n${example.url}\nPublished ingredients: ${example.ingredients}` : '',
    readiness.person ? `Published person: ${readiness.person.name} — ${readiness.person.role}\nSource: ${readiness.person.url}` : `Ask for: ${company.targetRoles.join(', ')}`,
    `Company route: ${company.contactUrl || company.website}`,
    readiness.email ? `General business email: ${readiness.email}` : '', readiness.phone ? `Company phone: ${readiness.phone}` : '',
    `Next step: ${readiness.approach}`, `Qualification questions:\n${company.buyingQuestions.join('\n')}`,
    'Product use and published roles do not establish current buying authority, demand or permission to send campaigns.'].filter(Boolean).join('\n\n');
}

export interface DailyResearchReport {
  day: string;
  startedAt: string;
  finishedAt: string;
  target: number;
  addedCompanies: { id: string; name: string; website: string; products: number }[];
  addedProducts: number;
  addedPeople: number;
  addedRoutes: number;
  enrichedCompanies: number;
  candidatesChecked: number;
  requests: number;
  searchRequests: number;
  searchConfigured: boolean;
  shortfall: number;
  status: 'target-met' | 'shortfall';
  warnings: string[];
  outcomes: { company: string; host: string; result: string }[];
  schedule: string;
  workflowUrl: string;
}
