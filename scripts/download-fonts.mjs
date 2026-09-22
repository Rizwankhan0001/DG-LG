import { mkdirSync, writeFileSync } from 'node:fs';
const url='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Lora:ital,wght@0,400;0,500;1,400&display=swap';
const response=await fetch(url,{signal:AbortSignal.timeout(30000),headers:{'User-Agent':'Mozilla/5.0 AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36'}});
if(!response.ok)throw new Error('Unable to download font CSS.');
let css=await response.text();let i=0;mkdirSync('public/fonts',{recursive:true});
for(const match of [...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)]+)\)/g)]){
  const remote=match[1];const suffix=remote.split('.').pop();const filename=`font-${i++}.${suffix}`;
  const font=await fetch(remote,{signal:AbortSignal.timeout(30000)});if(!font.ok)throw new Error('Unable to download font asset.');
  writeFileSync(`public/fonts/${filename}`,Buffer.from(await font.arrayBuffer()));css=css.replace(match[0],`url('/fonts/${filename}')`);
}
writeFileSync('public/fonts/fonts.css',css);console.log(`Saved ${i} font files locally.`);
