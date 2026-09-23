import { ArrowRight, Check, Clipboard, Database, ExternalLink, Globe, LockKeyhole, Mail, MapPin, Phone, ShieldCheck, Sparkles, Users } from 'lucide-react';
import type { Lead } from '../shared/types';
import { buyingRoute, calculateDemand, defaultPlan, demandRange } from '../shared/opportunity';
import { Button, useApp } from './lib';
import { updateRoute } from './navigation';

export function ResearchOverview(){
  const {data,mode,browse,navigate}=useApp();
  const phone=data.leads.filter(lead=>lead.phone).length;
  const email=data.leads.filter(lead=>lead.email).length;
  const markets=new Set(data.leads.map(lead=>lead.city)).size;
  return <section className="research-launch" aria-label="Start your research">
    <div className="research-launch-intro"><span className="eyebrow"><Globe size={14}/> YOUR MARKET, AT A GLANCE</span><h2>Less searching.<br/><em>Better conversations.</em></h2><p>{data.leads.length} {mode==='demo'?'sample':'researched'} locations across {markets} markets. Start with a city, check the evidence, and explore the product fit.</p><button onClick={()=>navigate('How it works')}>See the five-step workflow <ArrowRight size={16}/></button></div>
    <div className="research-start-options"><span>WHERE WOULD YOU LIKE TO START?</span>
      <button onClick={()=>browse()}><span className="research-option-icon"><MapPin size={20}/></span><span><strong>Explore a market</strong><small>Filter by city, buyer type and product</small></span><ArrowRight size={17}/></button>
      <button onClick={()=>{browse();updateRoute({contact:'phone'});}}><span className="research-option-icon"><Phone size={20}/></span><span><strong>Find a route to a conversation</strong><small>{phone} locations have a public phone · roles unconfirmed</small></span><ArrowRight size={17}/></button>
      <button onClick={()=>navigate('Data & accuracy')}><span className="research-option-icon"><ShieldCheck size={20}/></span><span><strong>Understand the evidence</strong><small>{email} locations have an email · sources and gaps explained</small></span><ArrowRight size={17}/></button>
    </div>
  </section>;
}

export function LeadBrief({lead,onSources}:{lead:Lead;onSources:()=>void}){
  const {data,notify}=useApp();const route=buyingRoute(lead);
  const evidence=new Set((lead.evidence||[]).map(item=>item.field)).size;
  const date=new Date(lead.sourceAt);const checked=Number.isNaN(date.getTime())?'Not recorded':date.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'});
  const copyBrief=async()=>{
    const plan=lead.demandPlan||defaultPlan(lead.segment);const scenario=calculateDemand(lead.segment,plan);
    const text=[`${lead.name} · ${lead.city}`,lead.demo?'FICTIONAL SAMPLE':'RESEARCHED PROSPECT — purchasing interest unconfirmed',`Category: ${lead.segment}`,`Address: ${lead.area||'Not recorded'}`,`Phone: ${lead.phone||'Not found'}`,`Email: ${lead.email||'Not found'}`,`Source: ${lead.sourceUrl||'Not provided'} (record sourced ${checked})`,'',`Suggested products: ${data.products.filter(product=>lead.products.includes(product.id)).map(product=>product.name).join(', ')}`,`Why they may fit: ${scenario.useCase.why}`,`Planning scenario only: ${demandRange(lead.segment,plan)}. Actual demand is unknown.`,`Suggested role to ask for (unconfirmed): ${route.role}`,route.note,`Ask: ${scenario.useCase.question}`,'Next step: confirm purchasing responsibility, actual monthly use and sample preferences.'].join('\n');
    try{await navigator.clipboard.writeText(text);notify('Conversation brief copied, including sources and unconfirmed assumptions.');}catch{notify('Clipboard is unavailable. Use the information below to prepare your conversation.','error');}
  };
  return <section className="lead-research-brief" aria-label="Research at a glance"><div className="brief-title"><span className="eyebrow">RESEARCH AT A GLANCE</span><button className="text-link" onClick={onSources}>Check sources <ArrowRight size={14}/></button></div>
    <div className="brief-facts"><div><ShieldCheck size={16}/><strong>{lead.demo?'Sample':evidence?`${evidence} linked facts`:'Source review needed'}</strong><small>{lead.demo?'Practice data only':`Record sourced ${checked}`}</small></div><div><Users size={16}/><strong>Buyer needs unconfirmed</strong><small>Volumes, supplier and purchasing role need a conversation.</small></div></div>
    <div className="brief-next"><span>ASK FOR</span><strong>{route.role}</strong><p>{route.note}</p></div>
    <Button variant="secondary" icon={Clipboard} onClick={()=>void copyBrief()}>Copy conversation brief</Button>
  </section>;
}

export function ActivationSteps(){
  const {data,navigate}=useApp();
  if(!data.readOnly)return null;
  return <section className="activation-card" aria-label="Activate your workspace"><div className="activation-heading"><div><span className="eyebrow">FROM PREVIEW TO DAILY USE</span><h2>Your workspace, in three steps.</h2><p>The research is ready to explore. Here is what enables the rest.</p></div><span className="activation-label"><Globe size={14}/> Preview is live</span></div>
    <div className="activation-steps">
      <article className="complete"><span className="activation-step-icon"><Check size={21}/></span><small>01 · READY NOW</small><h3>Explore your market</h3><p>Browse {data.leads.length} locations, filter prospects, compare products and copy a conversation brief.</p><button className="text-link" onClick={()=>navigate('Discover leads')}>Browse businesses <ArrowRight size={14}/></button></article>
      <article><span className="activation-step-icon"><Database size={21}/></span><small>02 · REQUIRED TO SAVE</small><h3>Connect a private workspace</h3><p>A persistent database and protected login enable saved shortlists, buyer notes, follow-ups and scheduled research.</p><a className="text-link" href="https://github.com/Rizwankhan0001/DG-LG/blob/main/DEPLOYMENT.md" target="_blank" rel="noreferrer">Backend setup guide <ExternalLink size={14}/></a></article>
      <article><span className="activation-step-icon"><Sparkles size={21}/></span><small>03 · OPTIONAL CONNECTIONS</small><h3>Add AI when you need it</h3><p>Connect AI for personalized drafts, Google for listing checks, or your verified email service for reviewed sending.</p><a className="text-link" href="#connections" onClick={e=>{e.preventDefault();document.getElementById('connections')?.scrollIntoView({behavior:'smooth'});}}>See available integrations <ArrowRight size={14}/></a></article>
    </div><p className="activation-footnote"><LockKeyhole size={14}/>Provider keys alone do not activate this public preview. Connect the private backend before enabling saving or automation.</p>
  </section>;
}
