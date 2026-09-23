import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { X, Loader2, SearchX, ArrowUpRight, type LucideIcon } from 'lucide-react';
import type { Bootstrap, Lead, Mode, Draft } from '../shared/types';
export async function api<T=Record<string,unknown>>(path:string,body?:unknown,method?:string):Promise<T>{
  const response=await fetch('/api'+path,{method:method||(body?'POST':'GET'),headers:{'Content-Type':'application/json','X-Requested-With':'Grow'},credentials:'same-origin',...(body?{body:JSON.stringify(body)}:{})});
  const json=await response.json();if(!response.ok){if(response.status===401)window.dispatchEvent(new Event('grow:logout'));throw new Error(json.error||'Unable to complete this action.');}return json;
}
export const currency=(value:number,compact=true)=>compact&&value>=100000?`₹${(value/100000).toFixed(1)}L`:compact&&value>=1000?`₹${(value/1000).toFixed(value%1000?1:0)}k`:new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format(value);
export const initials=(name:string)=>name.replace(/[^a-zA-Z0-9 ]/g,'').split(' ').filter(Boolean).slice(0,2).map(s=>s[0]).join('');
export const dateLabel=(date:string)=>new Date(date).toLocaleDateString('en-IN',{day:'numeric',month:'short'});
export const relativeTime=(date:string)=>{const m=Math.floor((Date.now()-Date.parse(date))/60000);return m<1?'Just now':m<60?`${m}m ago`:m<1440?`${Math.floor(m/60)}h ago`:`${Math.floor(m/1440)}d ago`;};
export type Page='Data & accuracy'|'How it works'|'Overview'|'Today'|'Discover leads'|'Saved leads'|'Sales pipeline'|'Outreach studio'|'Automations'|'Product catalogue'|'Reports'|'Settings';
export interface AppContextType {data:Bootstrap;mode:Mode;setMode:(m:Mode)=>void;refresh:()=>Promise<void>;navigate:(p:Page)=>void;openLead:(lead:Lead)=>void;logContact:(lead:Lead)=>void;openDraft:(draft:Draft)=>void;discover:(city?:string,segment?:string)=>void;browse:(city?:string,segment?:string)=>void;notify:(message:string,type?:'success'|'error')=>void;run:<T>(fn:()=>Promise<T>,message?:string)=>Promise<T|undefined>}
export const AppContext=createContext<AppContextType>(null!);
export const useApp=()=>useContext(AppContext);
export function Button({children,icon:Icon,variant='',className='',busy=false,requiresWrite=false,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{icon?:LucideIcon;variant?:string;busy?:boolean;requiresWrite?:boolean}){
  const context=useContext(AppContext);const unavailable=requiresWrite&&context?.data.readOnly;
  return <button {...props} title={unavailable?'Available after your private workspace is connected. See Settings for setup steps.':props.title} disabled={props.disabled||busy||unavailable} className={`button ${variant} ${className}`}>{busy?<Loader2 className="spin" size={16}/>:Icon?<Icon size={16}/>:null}{children}</button>;
}
export function Badge({children,tone='green'}:{children:ReactNode;tone?:string}){return <span className={`badge ${tone}`}>{children}</span>;}
export function Score({value}:{value:number}){return <span className={`score ${value>=80?'high':value>=60?'medium':'low'}`}><span className="score-dot"/>{value}<span className="score-denom">/100</span></span>;}
export function Avatar({name,segment,large=false}:{name:string;segment?:string;large?:boolean}){return <span className={`business-avatar ${large?'large':''} ${segment==='Cafés'?'coffee':segment==='Bakeries'?'bakery':segment==='Hotels & resorts'?'hotel':segment==='Restaurants'?'restaurant':'other'}`}>{initials(name)}</span>;}
export function EmptyState({title,text,action,icon:Icon=SearchX}:{title:string;text:string;action?:ReactNode;icon?:LucideIcon}){return <div className="empty-state"><span><Icon size={27}/></span><h3>{title}</h3><p>{text}</p>{action}</div>;}
export function PageHeading({eyebrow,title,description,children}:{eyebrow?:string;title:string;description:string;children?:ReactNode}){return <div className="page-heading"><div>{eyebrow&&<span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div><div className="heading-actions">{children}</div></div>;}
export function CardHeading({title,subtitle,children}:{title:string;subtitle?:string;children?:ReactNode}){return <div className="card-heading"><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div>{children}</div>;}
export function TextLink({children,onClick}:{children:ReactNode;onClick:()=>void}){return <button className="text-link" onClick={onClick}>{children}<ArrowUpRight size={15}/></button>;}
export function Modal({title,subtitle,onClose,children,wide=false,drawer=false}:{title:string;subtitle?:string;onClose:()=>void;children:ReactNode;wide?:boolean;drawer?:boolean}){
  const ref=useRef<HTMLDivElement>(null);const close=useRef(onClose);close.current=onClose;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement;const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    ref.current?.focus();
    const listener=(e:KeyboardEvent)=>{if(e.key==='Escape')close.current();if(e.key==='Tab'){
      const nodes=ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex="0"]');
      if(!nodes?.length)return;const first=nodes[0],last=nodes[nodes.length-1];
      if(e.shiftKey&&(document.activeElement===first||document.activeElement===ref.current)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===ref.current)){e.preventDefault();first.focus();}
    }};
    document.addEventListener('keydown',listener);return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',listener);previous?.focus();};
  },[]);
  return <div className={`modal-backdrop ${drawer?'drawer-backdrop':''}`} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className={`modal ${wide?'wide':''} ${drawer?'drawer':''}`}><div className="modal-heading"><div><h2>{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={20}/></button></div>{children}</div></div>;
}
export function SelectChips({items,selected,onChange}:{items:readonly string[];selected:string[];onChange:(items:string[])=>void}){return <div className="select-chips">{items.map(item=><button type="button" key={item} aria-pressed={selected.includes(item)} className={selected.includes(item)?'selected':''} onClick={()=>onChange(selected.includes(item)?selected.filter(x=>x!==item):[...selected,item])}>{item}</button>)}</div>;}
