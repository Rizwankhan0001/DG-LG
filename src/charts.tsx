import { useState } from 'react';
import type { Lead } from '../shared/types';
export function GrowthChart({leads,days=14}:{leads:Lead[];days?:number}){
  const [hover,setHover]=useState<number|null>(null);
  const dates=Array.from({length:days},(_,i)=>{const d=new Date();d.setDate(d.getDate()-days+1+i);d.setHours(23,59,59,999);return d;});
  const total=dates.map(d=>leads.filter(l=>Date.parse(l.createdAt)<=d.getTime()).length);
  const qualified=dates.map(d=>leads.filter(l=>l.score>=80&&Date.parse(l.createdAt)<=d.getTime()).length);
  const ticks=new Set(Array.from({length:6},(_,i)=>Math.round(i*(days-1)/5)));
  const max=Math.max(10,Math.ceil(Math.max(...total)/10)*10);const width=640,height=210,left=35,top=20,base=170;
  const point=(v:number,i:number)=>[left+i*(width-left-15)/(days-1),base-v*(base-top)/max];
  const line=(values:number[])=>values.map((v,i)=>`${i?'L':'M'}${point(v,i).join(',')}`).join(' ');
  return <div className="chart-wrap"><svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Cumulative leads and high-fit leads by creation date">
    <defs><linearGradient id="greenArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#3f8060" stopOpacity=".2"/><stop offset="100%" stopColor="#3f8060" stopOpacity=".01"/></linearGradient></defs>
    {[0,.25,.5,.75,1].map(t=><g key={t}><line x1={left} y1={base-t*(base-top)} x2={width-10} y2={base-t*(base-top)} stroke="#e8ebe5" strokeDasharray="3 4"/><text x="2" y={base-t*(base-top)+4} fontSize="10" fill="#8b938a">{Math.round(max*t)}</text></g>)}
    <path d={`${line(total)} L${point(0,days-1).join(',')} L${left},${base} Z`} fill="url(#greenArea)"/>
    <path d={line(total)} fill="none" stroke="#387254" strokeWidth="2.5" strokeLinejoin="round"/><path d={line(qualified)} fill="none" stroke="#bacb84" strokeWidth="2.5" strokeDasharray="5 5" strokeLinejoin="round"/>
    {dates.map((d,i)=><g key={i}>{ticks.has(i)&&<text x={point(0,i)[0]} y="198" textAnchor={i===days-1?'end':'middle'} fontSize="10" fill="#77816f">{d.toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</text>}<rect x={point(0,i)[0]-12} y={0} width={24} height={180} fill="transparent" onMouseEnter={()=>setHover(i)} onMouseLeave={()=>setHover(null)}/></g>)}
    {hover!==null&&<g><line x1={point(0,hover)[0]} x2={point(0,hover)[0]} y1="15" y2={base} stroke="#729480" strokeDasharray="3 3"/><circle cx={point(total[hover],hover)[0]} cy={point(total[hover],hover)[1]} r="5" fill="#245e42" stroke="white" strokeWidth="2"/><rect x={Math.min(510,Math.max(36,point(0,hover)[0]-60))} y="0" width="104" height="25" rx="5" fill="#244b38"/><text x={Math.min(510,Math.max(36,point(0,hover)[0]-60))+52} y="16" fill="white" textAnchor="middle" fontSize="10">{total[hover]} leads · {qualified[hover]} high fit</text></g>}
  </svg></div>;
}
export function Sparkline({values,tone='green'}:{values:number[];tone?:string}){const max=Math.max(...values,1);const path=values.map((v,i)=>`${i?'L':'M'}${i*80/(values.length-1)},${34-v*28/max}`).join(' ');return <svg className={`sparkline ${tone}`} viewBox="0 0 82 40" aria-hidden="true"><path d={`${path} L80,40 L0,40 Z`} fill="currentColor" opacity=".08"/><path d={path} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/></svg>;}
export function CityMap({onCity}:{onCity:(city:string)=>void}){return <div className="city-map"><svg viewBox="0 0 360 280" role="img" aria-label="Illustrative map showing Delhi NCR, Mumbai and Bengaluru">
  <defs><pattern id="mapdots" x="0" y="0" width="7" height="7" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="#c4ccb8"/></pattern></defs>
  <path d="M134 17 146 23 150 34 164 30 176 40 174 51 184 60 198 66 194 81 209 90 217 91 226 100 244 95 252 82 265 78 267 87 286 82 289 98 278 101 270 115 256 124 249 116 242 124 239 140 226 146 216 145 204 161 192 170 184 188 172 202 166 220 151 243 143 247 137 234 132 216 120 194 113 175 107 158 97 145 84 147 74 139 67 128 77 121 76 110 85 103 97 102 101 89 110 76 119 69 115 57 121 49 117 39 124 30Z" fill="#e9eddf" stroke="#d6ddc9" strokeWidth="1.2"/>
  <path d="M134 17 146 23 150 34 164 30 176 40 174 51 184 60 198 66 194 81 209 90 217 91 226 100 244 95 252 82 265 78 267 87 286 82 289 98 278 101 270 115 256 124 249 116 242 124 239 140 226 146 216 145 204 161 192 170 184 188 172 202 166 220 151 243 143 247 137 234 132 216 120 194 113 175 107 158 97 145 84 147 74 139 67 128 77 121 76 110 85 103 97 102 101 89 110 76 119 69 115 57 121 49 117 39 124 30Z" fill="url(#mapdots)"/>
  <path d="M147 84 Q93 116 107 161 Q104 194 146 211" fill="none" stroke="#659876" strokeWidth="1" strokeDasharray="4 5"/>
  {[{city:'Delhi NCR',x:147,y:84,tx:168,ty:76},{city:'Mumbai',x:107,y:161,tx:38,ty:167},{city:'Bengaluru',x:146,y:211,tx:165,ty:223}].map(p=><g key={p.city} className="map-city" role="button" tabIndex={0} aria-label={`Explore ${p.city}`} onClick={()=>onCity(p.city)} onKeyDown={e=>{if(e.key==='Enter'||e.key===' ')onCity(p.city);}}><circle cx={p.x} cy={p.y} r="15" fill="#77a36b" opacity=".12"/><circle cx={p.x} cy={p.y} r="9" fill="#77a36b" opacity=".16"/><circle cx={p.x} cy={p.y} r="4.5" fill="#39714b" stroke="#fff" strokeWidth="2"/><text x={p.tx} y={p.ty} fontSize="11" fontWeight="500" fill="#47634b">{p.city}</text></g>)}
  <text x="18" y="267" fontSize="8" fill="#9ba591">Illustrative market view</text>
  </svg></div>;}
