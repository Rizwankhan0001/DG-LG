import { useState } from 'react';
import { ArrowRight, Calculator, Check, ExternalLink, Package, MessageCircle, Users } from 'lucide-react';
import type { DemandPlan, Lead } from '../shared/types';
import { buyingRoute, calculateDemand, defaultPlan, demandRange, quantity, useCases } from '../shared/opportunity';
import { api, Badge, Button, useApp } from './lib';

export function OpportunityPreview({lead,onOpen}:{lead:Lead;onOpen:()=>void}) {
  const {data}=useApp();const options=useCases(lead.segment,data.products);
  const plan=lead.demandPlan??defaultPlan(lead.segment);const result=calculateDemand(lead.segment,plan);
  return <section className="opportunity-preview" aria-label="Product opportunity summary"><div className="opportunity-kicker"><Package size={16}/><span>YOUR PRODUCT OPPORTUNITY</span><Badge tone="sand">Estimate</Badge></div><h3>Why they could buy from you</h3><p>{result.useCase.why}</p><div className="preview-estimate"><div><small>{result.useCase.title} · planning scenario</small><strong>{demandRange(lead.segment,plan)}</strong><small>Actual requirement is unconfirmed.</small></div><button className="opportunity-open" aria-label="Open product opportunity" onClick={onOpen}><ArrowRight size={20}/></button></div><button className="text-link" onClick={onOpen}>See why, quantities & questions <ArrowRight size={14}/></button></section>;
}

export function Opportunity({lead}:{lead:Lead}) {
  const {data,run}=useApp();const options=useCases(lead.segment,data.products);
  const initial=lead.demandPlan??defaultPlan(lead.segment);
  const [plan,setPlan]=useState<DemandPlan>(initial);const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(JSON.stringify(initial));
  const dirty=JSON.stringify(plan)!==saved;const route=buyingRoute(lead);
  const result=calculateDemand(lead.segment,plan);
  const invalid=plan.dailyHigh<plan.dailyLow;
  const setNumber=(key:keyof DemandPlan,value:string)=>setPlan(p=>({...p,[key]:value===''?0:Number(value)}));
  return <div className="opportunity-detail"><div className="opportunity-intro"><span className="eyebrow">A PRACTICAL BUYING BRIEF</span><h3>Why & how much?</h3><p>{lead.name} is listed in {lead.city} as {lead.segment.toLowerCase()}. These ideas come from its buyer category and your catalogue; its menu, supplier and purchase volumes still need confirmation.</p></div>
    <div className="opportunity-uses">{options.map((c,i)=><article key={c.id} className={plan.useCaseId===c.id?'use-case selected':'use-case'}><div className="use-case-heading"><span>0{i+1}</span><h4>{c.title}</h4></div><p>{c.why}</p><div className="opportunity-products">{c.productIds.map(id=>data.products.find(p=>p.id===id)).filter(p=>!!p).map(p=><a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.image} alt="" loading="lazy"/><span>{p.name}</span><ExternalLink size={12}/></a>)}</div><button type="button" className="text-link" disabled={plan.useCaseId===c.id} onClick={()=>setPlan(defaultPlan(lead.segment,c.id))}>{plan.useCaseId===c.id?'Using this in calculator':'Estimate this use'}{plan.useCaseId===c.id?<Check size={14}/>:<ArrowRight size={14}/>}</button></article>)}</div>
    <section className="demand-calculator" aria-label="Monthly requirement calculator"><div className="calculator-heading"><Calculator size={20}/><div><h3>How much could they need?</h3><p>Change the assumptions to plan your conversation.</p></div></div>
      <form onSubmit={async e=>{e.preventDefault();if(invalid)return;setBusy(true);const {updatedAt,...input}=plan;const updated=await run(()=>api<Lead>(`/leads/${lead.id}/demand-plan`,input,'PUT'),'Requirement scenario saved. Confirm quantities with the buyer.');if(updated?.demandPlan){setPlan(updated.demandPlan);setSaved(JSON.stringify(updated.demandPlan));}setBusy(false);}}>
        <label>Product use<select value={plan.useCaseId} onChange={e=>setPlan(defaultPlan(lead.segment,e.target.value))}>{options.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <fieldset className="volume-range"><legend>{result.useCase.activity}</legend><label>Lower quantity<input aria-label="Lower daily quantity" type="number" min="0" max="100000" step="1" required value={plan.dailyLow} onChange={e=>setNumber('dailyLow',e.target.value)}/></label><span>to</span><label>Upper quantity<input aria-label="Upper daily quantity" type="number" min={plan.dailyLow} max="100000" step="1" required value={plan.dailyHigh} onChange={e=>setNumber('dailyHigh',e.target.value)}/></label></fieldset>
        <div className="calculator-inputs"><label>Service days / month<input type="number" required min="1" max="31" step="1" value={plan.days} onChange={e=>setNumber('days',e.target.value)}/></label><label>{result.useCase.portionUnit==='g'?'Grams per batch / order':result.useCase.portionUnit==='ml'?'Millilitres per drink / plate':'Sachets per drink / diner'}<input aria-label="Quantity per serving or batch" type="number" required min="0.01" max="100000" step="0.01" value={plan.portion} onChange={e=>setNumber('portion',e.target.value)}/></label><label>Share supplied by us (%)<input type="number" required min="0" max="100" step="1" value={plan.supplyShare} onChange={e=>setNumber('supplyShare',e.target.value)}/></label></div>
        <div className="demand-result" aria-live="polite"><span>ILLUSTRATIVE MONTHLY REQUIREMENT</span><strong>{invalid?'Check your quantity range':demandRange(lead.segment,plan)}</strong><p>{quantity(plan.dailyLow)}–{quantity(plan.dailyHigh)} × {plan.days} days × {quantity(plan.portion)} {result.useCase.portionUnit} × {plan.supplyShare}%{result.useCase.portionUnit==='sachets'?'':' ÷ 1,000'}</p></div>
        <p className="estimate-disclosure">{lead.demandPlan?'Saved planning inputs':'Example inputs, not researched volumes'}. The range represents your lower and upper scenarios, not a forecast. For multiple product alternatives, split this quantity between them; do not assign the whole amount to each product. Retail pack prices are not wholesale quotes.</p>
        <label>What did you learn from the buyer?<textarea rows={3} maxLength={1500} placeholder="Current product, actual monthly use, central purchasing contact, preferred sample…" value={plan.notes} onChange={e=>setPlan(p=>({...p,notes:e.target.value}))}/></label>
        <div className="calculator-save"><Button requiresWrite icon={Check} busy={busy} disabled={invalid}>Save requirement scenario</Button><span>{data.readOnly?'Try the calculator freely. Saving needs a private workspace.':dirty?'Unsaved changes':lead.demandPlan?'Saved to this lead':'Example scenario'}</span></div>
      </form>
    </section>
    <section className="buyer-conversation"><div><Users size={19}/><h3>Who should you speak to?</h3></div><strong>{route.role}</strong><p>{route.note}</p><div><MessageCircle size={18}/><h3>Ask this first</h3></div><blockquote>{result.useCase.question}</blockquote><p>Then agree on a sample, delivery needs and a follow-up date. Record confirmed quantities in your notes before preparing a quote.</p></section>
  </div>;
}
