import { useEffect, useState } from 'react';

export function routeParams() { return new URLSearchParams(location.hash.split('?')[1] || ''); }
export function routePage() {
  try { return decodeURIComponent(location.hash.slice(1).split('?')[0]); } catch { return 'Overview'; }
}
export function navigateRoute(page:string, values:Record<string,string> = {}, replace=false) {
  const params=new URLSearchParams(Object.entries(values).filter(([,value])=>value!==''));
  const hash=`#${encodeURIComponent(page)}${params.size?'?'+params.toString():''}`;
  if(location.hash===hash)return;
  history[replace?'replaceState':'pushState'](null,'',hash);
  window.dispatchEvent(new Event('grow:route'));
}
export function updateRoute(values:Record<string,string|null>, replace=true) {
  const params=routeParams();
  for(const [key,value] of Object.entries(values)) { if(value===null||value==='')params.delete(key);else params.set(key,value); }
  navigateRoute(routePage(),Object.fromEntries(params),replace);
}
export function useRouteParams() {
  const [params,setParams]=useState(routeParams);
  useEffect(()=>{const sync=()=>setParams(routeParams());window.addEventListener('popstate',sync);window.addEventListener('hashchange',sync);window.addEventListener('grow:route',sync);return()=>{window.removeEventListener('popstate',sync);window.removeEventListener('hashchange',sync);window.removeEventListener('grow:route',sync);};},[]);
  return params;
}
