import { readFileSync, writeFileSync } from 'node:fs';
import { createBuyerWorkbook } from '../shared/buyer-export.js';
import type { BuyerCompany, BuyerProduct, SupplierMaterial } from '../shared/intelligence.js';
import type { Product } from '../shared/types.js';
import { relevantSupplierProducts } from '../shared/intelligence.js';
import { productTitle } from '../shared/catalogue.js';

// Versioned public research only: no .env, CRM database or private workspaces.
const read=<T>(name:string):T=>JSON.parse(readFileSync(new URL(`../data/${name}.json`,import.meta.url),'utf8'));
const companies=read<BuyerCompany[]>('buyer-companies'),products=read<BuyerProduct[]>('buyer-products');
const workbook=createBuyerWorkbook({research:{companies,products,materials:read<SupplierMaterial[]>('supplier-materials'),workspaces:[]},products,catalogue:read<Product[]>('catalog'),scope:'All companies',filters:{}});
await workbook.xlsx.writeFile(new URL('../data/ingredient-buyers.xlsx',import.meta.url).pathname);
const csv=(value:unknown)=>{let text=String(value??'');if(/^[=+\-@\t\r]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
for(const [sheetName,file] of [['Contact people','buyer-contacts'],['Contact routes','buyer-contact-routes']]){
  const sheet=workbook.getWorksheet(sheetName)!;
  const rows:string[]=[];
  sheet.eachRow(row=>{const cells:string[]=[];for(let column=1;column<=sheet.columnCount;column++)cells.push(csv(row.getCell(column).text));rows.push(cells.join(','));});
  writeFileSync(new URL(`../data/${file}.csv`,import.meta.url),'\uFEFF'+rows.join('\r\n')+'\r\n');
}
const companyMap=new Map(companies.map(c=>[c.id,c]));
const materials=read<SupplierMaterial[]>('supplier-materials'),catalogue=read<Product[]>('catalog');
const rows=[['Company','Industry','Location','Product','Published ingredients','Ingredient families','Direct ingredients','Component ingredients','Published percentages','Suggested Dhampur products','Review status','Availability at check','Product source','Checked at','Company website','Public contact source','Public company email','Public company phone','Procurement status','Evidence type','Published people','Named-person sources'].map(csv).join(',')];
for(const p of products){const c=companyMap.get(p.companyId)!;rows.push([c.name,c.category,c.city,p.name,p.ingredients,[...new Set(p.matches.map(m=>m.family))].join('; '),p.matches.filter(m=>m.relation==='direct').map(m=>m.term).join('; '),p.matches.filter(m=>m.relation==='compound').map(m=>m.term).join('; '),p.matches.filter(m=>m.percent!==null).map(m=>`${m.term}: ${m.percent}% (${m.relation})`).join('; '),[...new Set(p.matches.flatMap(m=>relevantSupplierProducts(m,materials,catalogue).map(productTitle)))].join('; '),p.reviewStatus,p.status,p.url,p.checkedAt,c.website,c.contactUrl,c.email,c.phone,'Demand, volumes and purchasing authority unconfirmed',p.ingredientsSource,c.contacts.map(person=>`${person.name} — ${person.role}`).join('; '),c.contacts.map(person=>person.url).join('; ')].map(csv).join(','));}
writeFileSync(new URL('../data/ingredient-buyers.csv',import.meta.url),'\uFEFF'+rows.join('\r\n')+'\r\n');
console.log(`Exported ${companies.length} companies, ${products.length} product profiles and ${companies.reduce((n,c)=>n+c.contacts.length,0)} named public leads to data/ingredient-buyers.xlsx and CSV files.`);
