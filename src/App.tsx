import { useState, useEffect, useCallback, useRef } from 'react';
import { Leaf, LayoutDashboard, Search, Bookmark, Columns3, Mail, Workflow, Package, ChartNoAxesCombined, Settings, ChevronDown, Bell, ArrowUpRight, Sparkles, HelpCircle, PanelLeftClose, Menu, Check, X, Loader2, LogOut, ArrowRight, Sprout, CircleHelp, ListTodo, BookOpen, ShieldCheck } from 'lucide-react';
import type { Bootstrap, Lead, Mode, Draft } from '../shared/types';
import { api, AppContext, Button, Modal, relativeTime, type Page } from './lib';
import { DataQuality } from './DataQuality';
import { Guide } from './Guide';
import { Overview, Reports } from './Overview';
import { Today, ContactModal } from './Today';
import { LeadsPage, LeadDrawer, DiscoveryModal, AddLeadModal, ImportModal } from './Leads';
import { Pipeline, Outreach, Automations, ProductCatalogue, SettingsPage } from './Workspace';

const nav=[{label:'Overview',icon:LayoutDashboard},{label:'Today',icon:ListTodo},{label:'Discover leads',icon:Search},{label:'Saved leads',icon:Bookmark},{label:'Sales pipeline',icon:Columns3},{label:'Outreach studio',icon:Mail},{label:'Automations',icon:Workflow}] as const;
const management=[{label:'Data & accuracy',icon:ShieldCheck},{label:'How it works',icon:BookOpen},{label:'Product catalogue',icon:Package},{label:'Reports',icon:ChartNoAxesCombined},{label:'Settings',icon:Settings}] as const;
const pages=[...nav,...management].map(x=>x.label);
const pageLabels:Record<Page,string>={'Data & accuracy':'Data & accuracy','How it works':'How it works','Overview':'Overview','Today':'Today’s actions','Discover leads':'Find businesses','Saved leads':'Shortlist','Sales pipeline':'Sales pipeline','Outreach studio':'Outreach','Automations':'Automations','Product catalogue':'Product catalogue','Reports':'Reports','Settings':'Settings'};
const getPage=():Page=>{const value=decodeURIComponent(location.hash.slice(1).split('?')[0]);return pages.includes(value as Page)?value as Page:'Overview';};
function Login({onSuccess}:{onSuccess:()=>void}){
  const [email,setEmail]=useState('');const [password,setPassword]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  return <div className="login-page"><div className="login-brand"><span className="brand-mark"><Leaf size={25}/></span><span>dhampur <strong>green</strong><small>GROW · BUSINESS DEVELOPMENT</small></span></div><div className="login-card"><span className="eyebrow">A LITTLE GOODNESS. A LOT OF GROWTH.</span><h1>Welcome back.</h1><p>Your next business partnership starts here.</p><form onSubmit={async e=>{e.preventDefault();setBusy(true);setError('');try{await api('/auth/login',{email,password});onSuccess();}catch(err){setError((err as Error).message);}finally{setBusy(false);}}}><label>Work email<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} autoComplete="username" placeholder="you@dhampurgreen.com"/></label><label>Password<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password"/></label>{error&&<p className="form-error">{error}</p>}<Button busy={busy} className="full" icon={ArrowRight}>Sign in to Grow</Button></form><p className="small muted">Your workspace credentials are set by your administrator.</p></div><div className="login-bottom">Rooted in nature. Built for growth.</div></div>;
}
export default function App(){
  const [draftId,setDraftId]=useState<string|null>(()=>new URLSearchParams(location.hash.split('?')[1]).get('draft'));
  const [page,setPage]=useState<Page>(getPage);const [mode,setModeState]=useState<Mode>(()=>localStorage.getItem('grow-mode-v2')==='demo'?'demo':'live');
  const [data,setData]=useState<Bootstrap|null>(null);const [auth,setAuth]=useState(true);const [error,setError]=useState('');
  const [contactLead,setContactLead]=useState<Lead|null>(null);
  const [selectedLead,setSelectedLead]=useState<Lead|null>(null);const [modal,setModal]=useState<'discovery'|'add'|'import'|'help'|'activity'|null>(null);
  const [discoveryPrefill,setDiscoveryPrefill]=useState<{city?:string;segment?:string}>({});
  const [directoryFilter,setDirectoryFilter]=useState<{city?:string;segment?:string}>({});
  const [query,setQuery]=useState('');const [mobile,setMobile]=useState(false);const [toast,setToast]=useState<{text:string;type:string}|null>(null);
  const latestMode=useRef(mode);latestMode.current=mode;
  const refresh=useCallback(async()=>{try{const next=await api<Bootstrap>(`/bootstrap?mode=${mode}`);if(latestMode.current!==mode)return;setData(next);setAuth(true);setError('');}catch(err){setError((err as Error).message);}},[mode]);
  useEffect(()=>{void refresh();const interval=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);return()=>clearInterval(interval);},[refresh]);
  useEffect(()=>{const listener=()=>setAuth(false);window.addEventListener('grow:logout',listener);return()=>window.removeEventListener('grow:logout',listener);},[]);
  useEffect(()=>{const listener=()=>{setPage(getPage());setDraftId(new URLSearchParams(location.hash.split('?')[1]).get('draft'));};window.addEventListener('hashchange',listener);return()=>window.removeEventListener('hashchange',listener);},[]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),5000);return()=>clearTimeout(timer);}},[toast]);
  const notify=(text:string,type:'success'|'error'='success')=>setToast({text,type});
  const navigate=(next:Page)=>{setDraftId(null);setDirectoryFilter({});setQuery('');setPage(next);location.hash=encodeURIComponent(next);setMobile(false);window.scrollTo({top:0,behavior:'smooth'});};
  const setMode=(next:Mode)=>{setData(null);setModeState(next);localStorage.setItem('grow-mode-v2',next);setSelectedLead(null);setContactLead(null);};
  const openDraft=(draft:Draft)=>{navigate('Outreach studio');setDraftId(draft.id);location.hash=encodeURIComponent('Outreach studio')+'?draft='+encodeURIComponent(draft.id);};
  const browse=(city?:string,segment?:string)=>{navigate('Discover leads');setDirectoryFilter({city,segment});};
  const discover=(city?:string,segment?:string)=>{setDiscoveryPrefill({city,segment});setModal('discovery');};
  async function run<T,>(fn:()=>Promise<T>,message?:string):Promise<T|undefined>{try{const result=await fn();await refresh();if(message)notify(message);return result;}catch(err){notify((err as Error).message,'error');return undefined;}}
  if(!auth)return <Login onSuccess={()=>{setAuth(true);void refresh();}}/>;
  if(!data)return <div className="app-loading"><span className="brand-mark"><Leaf size={30}/></span><h2>Growing your next opportunity.</h2>{error?<><p>{error}</p><Button onClick={()=>void refresh()}>Try again</Button></>:<Loader2 className="spin" size={22}/>}</div>;
  const activeJobs=data.jobs.filter(j=>['running','queued'].includes(j.status));
  return <AppContext.Provider value={{data,mode,setMode,refresh,navigate,openLead:setSelectedLead,openDraft,logContact:lead=>{setSelectedLead(null);setContactLead(lead);},discover,browse,notify,run}}>
    <div className="app-shell">
      {mobile&&<div className="sidebar-scrim" onClick={()=>setMobile(false)}/>}
      <aside className={`sidebar ${mobile?'mobile-open':''}`}>
        <a className="brand" href="#Overview" onClick={()=>navigate('Overview')}><span className="brand-mark"><Leaf size={25} strokeWidth={1.6}/></span><span>dhampur <strong>green</strong><small>BUSINESS GROWTH WORKSPACE</small></span></a>
        <div className="workspace-switch"><span className="workspace-icon"><Sprout size={18}/></span><div><strong>Hospitality sales</strong><span>Dhampur Green · India</span></div><span className="workspace-dot"/></div>
        <div className="nav-group-label">YOUR SALES WORKFLOW</div>
        <nav>{nav.map(({label,icon:Icon})=><button key={label} className={`nav-item ${page===label?'active':''}`} onClick={()=>navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{pageLabels[label]}</span>{label==='Saved leads'&&<small>{data.leads.filter(l=>l.saved).length}</small>}{label==='Automations'&&activeJobs.length>0&&<i className="live-dot"/>}</button>)}</nav>
        <div className="nav-group-label manage-label">MANAGE</div><nav>{management.map(({label,icon:Icon})=><button key={label} className={`nav-item ${page===label?'active':''}`} onClick={()=>navigate(label)}><Icon size={18} strokeWidth={1.7}/><span>{pageLabels[label]}</span></button>)}</nav>
        <div className="sidebar-bottom"><div className="growth-note"><span className="note-leaf"><Sparkles size={17}/></span><h4>New leads, on a schedule.</h4><p>Choose your cities. Discover prospects daily. Review your next conversations.</p><button onClick={()=>navigate('Automations')}>Set up automation <ArrowUpRight size={14}/></button><Leaf className="note-decoration" size={70}/></div><button className="help-button" onClick={()=>navigate('How it works')}><CircleHelp size={17}/>Help & getting started<ArrowUpRight size={14}/></button><div className="profile"><span className="user-avatar">DG</span><div><strong>Dhampur Green</strong><small>Business workspace</small></div><button className="icon-button" aria-label="Workspace settings" onClick={()=>navigate('Settings')}><Settings size={16}/></button></div></div>
      </aside>
      <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu size={20}/></button><span className="desktop-panel"><PanelLeftClose size={17}/></span><span className="breadcrumb-workspace">Workspace</span><span className="slash">/</span><strong>{pageLabels[page]}</strong></div><div className="topbar-actions"><div className="global-search"><Search size={15}/><input aria-label="Search all leads" placeholder="Search your leads…" value={query} onChange={e=>{if(page!=='Discover leads')navigate('Discover leads');setQuery(e.target.value);}}/><kbd>⌕</kbd></div><label className={`mode-switch ${mode}`}><span className="live-dot"/><select aria-label="Workspace data mode" value={mode} onChange={e=>setMode(e.target.value as Mode)}><option value="demo">Sample workspace</option><option value="live">Real businesses</option></select><ChevronDown size={13}/></label><button className="notification-button icon-button" aria-label="View activity" onClick={()=>setModal('activity')}><Bell size={18}/>{activeJobs.length>0&&<span/>}</button><span className="top-user">DG</span></div></header>
        <main className="main-content">
          {mode==='demo'&&<div className="demo-banner"><span><span className="sample-dot"/> You’re exploring sample leads. Your product catalogue is real.</span><button onClick={()=>setMode('live')}>View real businesses <ArrowRight size={13}/></button></div>}
          {error&&<div className="inline-warning">Connection interrupted. Displaying your last loaded data. <button onClick={()=>void refresh()}>Retry</button></div>}
          {activeJobs.length>0&&<button className="running-banner" onClick={()=>navigate('Automations')}><Loader2 size={15} className="spin"/><span>{activeJobs[0].progress}</span><span>View activity <ArrowRight size={13}/></span></button>}
          {page==='Data & accuracy'&&<DataQuality/>}{page==='How it works'&&<Guide/>}{page==='Overview'&&<Overview/>}{page==='Today'&&<Today/>}
          {(page==='Discover leads'||page==='Saved leads')&&<LeadsPage saved={page==='Saved leads'} query={query} setQuery={setQuery} initialFilter={directoryFilter} onAdd={()=>setModal('add')} onImport={()=>setModal('import')}/>}
          {page==='Sales pipeline'&&<Pipeline/>}{page==='Outreach studio'&&<Outreach focusedId={draftId}/>}{page==='Automations'&&<Automations/>}{page==='Product catalogue'&&<ProductCatalogue/>}{page==='Reports'&&<Reports/>}{page==='Settings'&&<SettingsPage onLogout={async()=>{await api('/auth/logout',{});setAuth(false);}}/>}
          <footer className="page-footer"><span><Leaf size={12}/> Dhampur Green · Hospitality sales</span><span>Dhampur Green Grow <span className="footer-dot">·</span> Sources linked. Decisions yours.</span></footer>
        </main>
      </div>
    </div>
    {contactLead&&<ContactModal lead={data.leads.find(lead=>lead.id===contactLead.id)??contactLead} onClose={()=>setContactLead(null)}/>}
    {selectedLead&&<LeadDrawer lead={data.leads.find(l=>l.id===selectedLead.id)??selectedLead} onClose={()=>setSelectedLead(null)}/>}
    {modal==='discovery'&&<DiscoveryModal prefill={discoveryPrefill} onClose={()=>setModal(null)}/>}{modal==='add'&&<AddLeadModal onClose={()=>setModal(null)}/>}{modal==='import'&&<ImportModal onClose={()=>setModal(null)}/>}
    {modal==='activity'&&<Modal title="Workspace activity" subtitle="Your latest discoveries and relationship updates." onClose={()=>setModal(null)}><div className="modal-content activity-list">{data.activities.length?data.activities.map(a=><div className="activity-item" key={a.id}><span className={`activity-icon ${a.kind}`}><Sprout size={16}/></span><div><p>{a.text}</p><small>{relativeTime(a.createdAt)}</small></div></div>):<p className="muted">Your activity will appear here as you add leads and run searches.</p>}</div></Modal>}
    {modal==='help'&&<Modal title="Your sales workflow" subtitle="Four steps from a business listing to your next customer." onClose={()=>setModal(null)}><div className="modal-content help-steps">{[['1','Find businesses','Start with the researched businesses already in your workspace. Filter by city and buyer category. Refresh supported official directories in Data & accuracy to add more sourced locations.'],['2','Review fit','Open a business, check the official source and product suggestions, then qualify and shortlist the prospects you want to pursue.'],['3','Reach out','Confirm who handles purchasing. Prepare a draft, review the message and recipient, then send from Outreach once email sending is connected.'],['4','Follow up','Record calls and buyer needs in Notes. Set a follow-up date and move the sales stage as you send samples, negotiate and win orders.']].map(([n,t,d])=><div key={n}><span>{n}</span><section><h3>{t}</h3><p>{d}</p></section></div>)}<Button onClick={()=>{setModal(null);navigate('Discover leads');}} icon={ArrowRight}>Browse businesses</Button></div></Modal>}
    {toast&&<div className={`toast ${toast.type}`} role="status">{toast.type==='error'?<HelpCircle size={18}/>:<Check size={18}/>}<span>{toast.text}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={16}/></button></div>}
  </AppContext.Provider>;
}
