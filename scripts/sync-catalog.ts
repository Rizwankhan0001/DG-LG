import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { z } from 'zod';
import type { Product } from '../shared/types.js';
const productSchema=z.object({id:z.number(),title:z.string(),handle:z.string(),images:z.array(z.object({src:z.string().url()})),variants:z.array(z.object({id:z.number(),price:z.string().regex(/^\d+(\.\d+)?$/),title:z.string(),available:z.boolean().optional()})).min(1)});
const path=new URL('../data/catalog.json',import.meta.url);
const existing=JSON.parse(readFileSync(path,'utf8')) as Product[];
const response=await fetch('https://www.dhampurgreen.com/products.json?limit=250',{signal:AbortSignal.timeout(30000)});
if(!response.ok)throw new Error(`Catalogue request returned ${response.status}`);
const {products}=z.object({products:z.array(productSchema)}).parse(await response.json());
mkdirSync(new URL('../public/products/',import.meta.url),{recursive:true});
let downloaded=0;
for(const item of existing){
  const product=products.find(p=>String(p.id)===item.id);if(!product){console.warn(`Product ${item.id} is no longer in the catalogue. Keeping the last snapshot.`);continue;}
  item.name=product.title.trim();item.price=Number(product.variants[0].price);item.unit=product.variants[0].title;
  item.variants=product.variants.map(variant=>({id:String(variant.id),title:variant.title,price:Number(variant.price),...(variant.available===undefined?{}:{available:variant.available})}));
  item.url=`https://www.dhampurgreen.com/products/${product.handle}`;item.syncedAt=new Date().toISOString();
  const source=product.images[0]?.src;
  if(source){
    const url=new URL(source);if(url.hostname!=='cdn.shopify.com')throw new Error('Unexpected catalogue image host.');url.searchParams.set('width','600');
    const image=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!image.ok)throw new Error(`Image ${item.id} returned ${image.status}`);
    const ext=source.split('?')[0].split('.').pop()?.replace(/[^a-z]/g,'')||'webp';
    const filename=`${item.id}.${ext}`;
    writeFileSync(new URL(`../public/products/${filename}`,import.meta.url),Buffer.from(await image.arrayBuffer()));
    item.image=`/products/${filename}`;downloaded++;
  }
}
writeFileSync(path,JSON.stringify(existing,null,2)+'\n');
console.log(`Updated ${existing.length} curated products and ${downloaded} images. Restart the API to load the catalogue snapshot.`);
