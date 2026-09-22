import type { Lead } from './types.js';

export function businessDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Kolkata', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(part=>part.type===type)!.value).join('-');
}
export function dateAfter(days:number, date = new Date()):string {
  const day = new Date(businessDate(date)+'T12:00:00+05:30');
  day.setUTCDate(day.getUTCDate()+days);
  return businessDate(day);
}
export function isOpenLead(lead:Lead):boolean {
  return !lead.suppressed && !['Won','Lost'].includes(lead.stage);
}
export function followUpState(lead:Lead, today=businessDate()):'overdue'|'today'|'upcoming'|'none' {
  if(!isOpenLead(lead)||!lead.nextFollowUp)return 'none';
  return lead.nextFollowUp<today?'overdue':lead.nextFollowUp===today?'today':'upcoming';
}
