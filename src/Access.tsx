import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, HelpCircle, Leaf, Loader2, LockKeyhole, Menu, ShieldCheck, X } from 'lucide-react';
import type { AccessStatus } from '../shared/access';
import type { Bootstrap } from '../shared/types';
import App, { nav, management, pageLabels } from './App';
import { Credentials } from './Credentials';
import { IngredientBuyers } from './IngredientBuyers';
import { api, AppContext, Button, type AppContextType, type Page } from './lib';
import { navigateRoute, routePage } from './navigation';

export default function Access() {
  const [access,setAccess]=useState<AccessStatus|null>(null);
  const [error,setError]=useState('');
  const version=useRef(0);
  const refresh=useCallback(async()=>{
    const request=++version.current;
    try{const status=await api<AccessStatus>('/auth/status');if(request===version.current){setAccess(status);setError('');}}
    catch(err){if(request===version.current){setAccess(null);setError((err as Error).message);}}
  },[]);
  useEffect(()=>{
    void refresh();
    const logout=()=>{version.current++;setAccess(null);void refresh();};
    const focus=()=>void refresh();
    const timer=setInterval(()=>{if(document.visibilityState==='visible')void refresh();},5000);
    window.addEventListener('grow:logout',logout);window.addEventListener('focus',focus);
    return()=>{version.current++;clearInterval(timer);window.removeEventListener('grow:logout',logout);window.removeEventListener('focus',focus);};
  },[refresh]);
  if(!access)return <div className="app-loading"><span className="brand-mark"><Leaf size={30}/></span><h2>Opening your workspace.</h2>{error?<><p role="alert">{error}</p><Button onClick={()=>void refresh()}>Try again</Button></>:<Loader2 className="spin" size={22}/>}</div>;
  return access.role==='owner'?<App access={access} onSessionChange={refresh}/>:<RestrictedWorkspace key={`${access.role}:${access.email}`} access={access} onSessionChange={refresh}/>;
}
function RestrictedWorkspace({access,onSessionChange}:{access:AccessStatus;onSessionChange:()=>Promise<void>}) {
  const [mobile,setMobile]=useState(false);
  const [notice,setNotice]=useState('');
  const [page,setPage]=useState<Page>(access.role==='member'&&routePage()==='Ingredient buyers'?'Ingredient buyers':'Credentials');
  const [toast,setToast]=useState<{text:string;type:'success'|'error'}|null>(null);
  const allowed=new Set<Page>(access.role==='member'?['Ingredient buyers','Credentials']:['Credentials']);
  const destination:Page=access.role==='member'?'Ingredient buyers':'Credentials';
  useEffect(()=>{
    const guard=()=>{const requested=routePage() as Page;if(!allowed.has(requested)){if(requested)setNotice(`This section is locked. ${access.role==='member'?'Your account can use Ingredient buyers and Credentials only.':'Sign in to open workspace sections.'}`);navigateRoute(destination,{},true);setPage(destination);}else setPage(requested);document.title=`${pageLabels[allowed.has(requested)?requested:destination]} · Dhampur Green Grow`;};
    guard();window.addEventListener('hashchange',guard);window.addEventListener('popstate',guard);window.addEventListener('grow:route',guard);
    return()=>{window.removeEventListener('hashchange',guard);window.removeEventListener('popstate',guard);window.removeEventListener('grow:route',guard);};
  },[access.role]);
  useEffect(()=>{if(toast){const timer=setTimeout(()=>setToast(null),5000);return()=>clearTimeout(timer);}},[toast]);
  const navigate=(next:Page)=>{setMobile(false);if(allowed.has(next))navigateRoute(next);else setNotice(`${pageLabels[next]} is locked. Only the platform owner can open this section.`);};
  const notify=(text:string,type:'success'|'error'='success')=>setToast({text,type});
  async function run<T>(fn:()=>Promise<T>,message?:string):Promise<T|undefined>{if(access.readOnly){notify('This preview cannot save changes.','error');return undefined;}try{const result=await fn();if(message)notify(message);return result;}catch(err){notify((err as Error).message,'error');return undefined;}}
  const context:AppContextType={data:{readOnly:access.readOnly} as Bootstrap,accessRole:access.role,mode:'live',setMode:()=>{},refresh:async()=>{},navigate,openLead:()=>{},logContact:()=>{},openDraft:()=>{},discover:()=>{},browse:()=>{},notify,run};
  const items=(sections:typeof nav|typeof management)=>sections.map(({label,icon:Icon})=>{const available=allowed.has(label);return <button key={label} className={`nav-item ${page===label?'active':''} ${available?'':'nav-locked'}`} aria-disabled={!available} onClick={()=>navigate(label)} title={available?pageLabels[label]:'Locked · Owner access only'}><Icon size={18}/><span>{pageLabels[label]}</span>{!available&&<LockKeyhole size={14} aria-label="Locked"/>}</button>;});
  return <div className="app-shell restricted-shell"><a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>Skip to main content</a>{mobile&&<div className="sidebar-scrim" onClick={()=>setMobile(false)}/>}
    <aside className={`sidebar ${mobile?'mobile-open':''}`}><a className="brand" href={access.role==='member'?'#Ingredient%20buyers':'#Credentials'}><span className="brand-mark"><Leaf size={25}/></span><span>dhampur <strong>green</strong><small>BUSINESS GROWTH WORKSPACE</small></span></a><div className="workspace-switch"><ShieldCheck size={20}/><div><strong>Private workspace</strong><span>{access.role==='member'?'Ingredient access':'Sign-in required'}</span></div></div><div className="nav-group-label">YOUR SALES WORKFLOW</div><nav aria-label="Sales workflow">{items(nav)}</nav><div className="nav-group-label manage-label">MANAGE</div><nav aria-label="Management">{items(management)}</nav><div className="sidebar-bottom"><div className="restricted-note"><LockKeyhole size={20}/><strong>Workspace protected</strong><p>{access.role==='member'?'Your account can use ingredient research. The owner controls every other section.':'Sign in with an account provided by the owner.'}</p></div></div></aside>
    <div className="main-shell"><header className="topbar"><div className="breadcrumb"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={()=>setMobile(true)}><Menu size={20}/></button><span>Workspace</span><span className="slash">/</span><strong>{pageLabels[page]}</strong></div><span className="access-pill"><LockKeyhole size={14}/>{access.authenticated?'Ingredient member':'Sign-in required'}</span></header><main id="main-content" className="main-content" tabIndex={-1}>{notice&&<div className="locked-notice" role="status"><LockKeyhole size={18}/><span>{notice}</span><button className="icon-button" aria-label="Dismiss locked section notice" onClick={()=>setNotice('')}><X size={16}/></button></div>}<AppContext.Provider value={context}>{page==='Ingredient buyers'&&access.role==='member'?<IngredientBuyers/>:<Credentials access={access} onSessionChange={onSessionChange}/>}</AppContext.Provider></main></div>
    {toast&&<div className={`toast ${toast.type}`} role="status">{toast.type==='error'?<HelpCircle size={18}/>:<Check size={18}/>}<span>{toast.text}</span><button aria-label="Dismiss notification" onClick={()=>setToast(null)}><X size={16}/></button></div>}
  </div>;
}
