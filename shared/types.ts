export const cities = ['Delhi NCR', 'Mumbai', 'Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Jaipur', 'Kolkata', 'Goa', 'Ahmedabad'] as const;
export const segments = ['Cafés', 'Restaurants', 'Hotels & resorts', 'Bakeries', 'Bars & lounges', 'Caterers', 'Sweet shops', 'Distributors'] as const;
export const stages = ['New', 'Qualified', 'Contacted', 'Sample sent', 'Negotiation', 'Won', 'Lost'] as const;
export type Segment = typeof segments[number];
export type Stage = typeof stages[number];
export type Mode = 'demo' | 'live';
export interface DemandPlan { useCaseId:string; dailyLow:number; dailyHigh:number; days:number; portion:number; supplyShare:number; notes:string; updatedAt?:string }
export const contactOutcomes = ['Connected', 'No answer', 'Interested', 'Sample requested', 'Not interested'] as const;
export interface ContactLog { id:string; channel:'Call'|'Email'|'Meeting'; outcome:typeof contactOutcomes[number]; summary:string; createdAt:string; nextFollowUp:string }
export interface Product { id: string; name: string; category: string; image: string; url: string; price: number; unit: string; segments: Segment[]; pitch: string; syncedAt: string }
export interface Lead {
  id: string; name: string; city: string; area: string; segment: Segment; stage: Stage;
  score: number; scoreReasons: string[]; products: string[]; email: string; phone: string;
  website: string; source: string; sourceUrl: string; sourceId: string; sourceAt: string;
  rating: number | null; reviews: number; value: number; valueBasis: string; owner: string;
  notes: { id: string; text: string; createdAt: string }[]; tags: string[]; saved: boolean;
  demo: boolean; createdAt: string; updatedAt: string; nextFollowUp: string; suppressed: boolean;
  emailSource: string; aiSummary: string; aiGenerated: boolean;
  contactContext?: string;
  brand?: string;
  demandPlan?: DemandPlan;
  contactHistory?: ContactLog[];
  directoryId?: string;
  researchCheck?: { checkedAt:string; url:string; changes:{field:'name'|'area'|'phone'|'email'; current:string; published:string}[] };
  aiGrounding?: { generatedAt:string; model:string; sourceUrls:string[]; evidenceCount:number };
  evidence?: { field: 'name' | 'area' | 'phone' | 'email'; value: string; url: string; checkedAt: string }[];
}
export interface Draft { id: string; leadId: string; leadName: string; email: string; subject: string; body: string; status: 'draft' | 'sending' | 'sent' | 'failed'; engine: 'template' | 'openai'; demo: boolean; createdAt: string; sentAt?: string; providerId?: string; error?: string; delivery?: {startedAt:string;payload:{from:string;to:string[];subject:string;text:string;reply_to?:string}} }
export interface Automation { id: string; name: string; cities: string[]; segments: Segment[]; frequency: 'daily' | 'weekly'; enabled: boolean; mode: Mode; minScore: number; draftOutreach: boolean; enrichEmails?: boolean; lastRun: string | null; nextRun: string; createdAt: string }
export interface Job { id: string; type: 'discovery'; status: 'queued' | 'running' | 'completed' | 'failed'; mode: Mode; cities: string[]; segments: Segment[]; limit: number; found: number; duplicates: number; progress: string; error: string; automationId?: string; createdAt: string; finishedAt?: string }
export interface Activity { id: string; text: string; kind: string; demo: boolean; createdAt: string }
export interface Settings { company: string; senderName: string; targetCities: string[]; monthlyTarget: number; defaultDealValue: number; signature: string }
export interface Integration { id: string; name: string; configured: boolean; enabled?: boolean; description: string; keys: string[]; url: string }
export interface Bootstrap { readOnly?:boolean; leads: Lead[]; products: Product[]; drafts: Draft[]; automations: Automation[]; jobs: Job[]; activities: Activity[]; settings: Settings; integrations: Integration[]; mode: Mode; authenticated: boolean }
export interface Readiness { environment:'local'|'production'; publicUrl:string|null; loginProtected:boolean; databaseHealthy:boolean; schedulerEnabled:boolean; backupsConfigured:boolean; checks:{id:string;title:string;ready:boolean;detail:string}[] }
export interface DirectorySource { id:string; name:string; brand:string; city:string; segment:Segment; url:string; parser:'theobroma'|'blue-tokai' }
export interface DirectoryStatus { id:string; checkedAt?:string; count?:number; error?:string }
export interface DataReport { total:number; withEvidence:number; withPhone:number; withEmail:number; uniquePhones:number; uniqueEmails:number; stale:number; needsReview:number; brands:number; byCity:{city:string;count:number}[]; bySegment:{segment:string;count:number}[]; sources:(DirectorySource & {status?:DirectoryStatus})[]; ai:{configured:boolean;used:number;limit:number}; google:{configured:boolean;used:number;limit:number}; scheduledRefresh:boolean }
