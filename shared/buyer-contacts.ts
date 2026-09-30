import type { BuyerCompany, BuyerContact, BuyerProduct } from './intelligence.js';

export const contactDepartments = ['Procurement', 'Product development', 'Operations', 'Sales', 'Leadership'] as const;
export const contactSortOptions = [
  ['relevance', 'Purchasing / R&D first'], ['title', 'Job title A–Z'],
  ['name', 'Person name A–Z'], ['newest', 'Source checked: newest'],
  ['source', 'Company sources first'],
] as const;
export type ContactSort = typeof contactSortOptions[number][0];
const stamp = (value: string) => Number.isFinite(Date.parse(value)) ? Date.parse(value) : 0;
const sourceRank = (contact: BuyerContact) => ({ 'User verified': 0, 'Company website': 1, 'Company announcement': 2, 'Professional profile': 3, 'Third-party directory': 4 })[contact.sourceType];
const roleRank = (contact: BuyerContact) => contact.department ? contactDepartments.indexOf(contact.department) : contactDepartments.length;

/** Published role relevance is an introduction order, never a claim of buying authority. */
export function sortBuyerContacts(contacts: BuyerContact[], order: string = 'relevance') {
  return [...contacts].sort((a, b) => {
    let comparison = 0;
    if (order === 'title') comparison = a.role.localeCompare(b.role);
    else if (order === 'name') comparison = a.name.localeCompare(b.name);
    else if (order === 'newest') comparison = stamp(b.checkedAt) - stamp(a.checkedAt);
    else if (order === 'source') comparison = sourceRank(a) - sourceRank(b);
    else comparison = Number(b.status === 'Buyer verified') - Number(a.status === 'Buyer verified') || roleRank(a) - roleRank(b) || sourceRank(a) - sourceRank(b);
    return comparison || a.name.localeCompare(b.name);
  });
}

export function contactApproach(contact: BuyerContact): string {
  const purpose: Record<string, string> = {
    Procurement: 'Confirm their ingredient category, then ask about supplier registration, specifications and sample approval.',
    'Product development': 'Discuss ingredient specifications and sample trials, then ask who handles commercial purchasing.',
    Operations: 'Confirm the manufacturing site or contract factory and ask who purchases its raw materials.',
    Sales: 'Ask for an introduction to the raw-material purchasing team; the published role is in sales.',
    Leadership: 'Request an introduction to the person responsible for ingredient sourcing and supplier approval.',
  };
  return `${contact.status === 'Buyer verified' ? '' : 'Confirm the current role first. '}${purpose[contact.department || ''] || 'Ask which team handles ingredient sourcing and supplier approval.'}`;
}

/** Evidence check date, not a claim that a person was appointed or verified on that date. */
export function companyEvidenceDate(company: BuyerCompany, products: BuyerProduct[]) {
  return Math.max(0, stamp(company.contactCheckedAt), ...company.contacts.map(contact => stamp(contact.checkedAt)), ...(company.contactRoutes ?? []).map(route => stamp(route.checkedAt)), ...products.map(product => stamp(product.checkedAt)));
}

export function sortBuyerCompanies(entries: [string, BuyerProduct[]][], companies: Map<string, BuyerCompany>, order: string) {
  if (!['name', 'newest', 'oldest', 'products', 'contacts', 'procurement'].includes(order)) return [...entries];
  return [...entries].sort(([a, ap], [b, bp]) => {
    const ac = companies.get(a)!, bc = companies.get(b)!;
    const count = (company: BuyerCompany) => company.contacts.filter(contact => contact.department === 'Procurement').length;
    const ad = companyEvidenceDate(ac, ap), bd = companyEvidenceDate(bc, bp);
    const comparison = order === 'name' ? ac.name.localeCompare(bc.name)
      : order === 'newest' ? bd - ad : order === 'oldest' ? (ad || Infinity) - (bd || Infinity)
      : order === 'products' ? bp.length - ap.length : order === 'contacts' ? bc.contacts.length - ac.contacts.length : count(bc) - count(ac);
    return comparison || ac.name.localeCompare(bc.name);
  });
}
