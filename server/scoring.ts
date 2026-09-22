import type { Lead, Product, Segment } from '../shared/types.js';
export function scoreLead(lead: Pick<Lead,'segment'|'city'|'phone'|'email'|'website'|'rating'|'reviews'>, products: Product[], targetCities: string[]) {
  const matches = products.filter(p=>p.segments.includes(lead.segment));
  let score = matches.length ? 35 : 5;
  const reasons = [matches.length ? `+35 · ${matches.length} catalogue products fit this buyer category` : '+5 · Product fit needs review'];
  if(targetCities.includes(lead.city)) {score+=15; reasons.push('+15 · Located in a priority market');}
  if(lead.email){score+=15; reasons.push('+15 · Business email available; confirm deliverability');}
  if(lead.phone){score+=10; reasons.push('+10 · Business phone available');}
  if(lead.website){score+=10; reasons.push('+10 · Business website available');}
  if(lead.rating && lead.rating>=4){score+=10; reasons.push('+10 · Listing rating of 4.0 or higher');}
  if(lead.reviews>=50){score+=5; reasons.push('+5 · At least 50 listing reviews');}
  return {score,scoreReasons:reasons,products:matches.slice(0,4).map(p=>p.id)};
}
export function classifySegment(type:string, fallback:Segment):Segment {
  if(/bakery/.test(type)) return 'Bakeries';
  if(/cafe|coffee|tea_house/.test(type)) return 'Cafés';
  if(/hotel|resort|lodging/.test(type)) return 'Hotels & resorts';
  if(/bar|pub|night_club/.test(type)) return 'Bars & lounges';
  if(/cater/.test(type)) return 'Caterers';
  if(/restaurant/.test(type)) return 'Restaurants';
  return fallback;
}
export function csvCell(value:unknown):string {
  let s=String(value??'');
  if(/^[\s]*[=+@\-\t\r]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
