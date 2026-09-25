import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogueCsv, productPack, productFitsLead, productTitle, productVariants } from '../shared/catalogue.js';
import type { Product } from '../shared/types.js';
const products=JSON.parse(readFileSync(new URL('../data/catalog.json',import.meta.url),'utf8')) as Product[];

test('retail references use the recorded variant rather than a different pack in the product title',()=>{
  const sugar=products.find(product=>product.id==='7161040896163')!;
  assert.match(sugar.name,/1Kg/);assert.equal(productPack(sugar),'10 Kg');
  assert.equal(productTitle(sugar),'Demerara Brown Sugar Sachets');
  assert.equal(productVariants(sugar)[0].price,1399);assert.equal(productVariants(sugar)[0].title,'10 Kg');
  const muscovado=products.find(product=>product.id==='6613007368355')!;
  assert.match(productPack(muscovado),/500gm.*Pack of 2/);
  const unknown={...sugar,name:'Sugar',unit:'Default Title'};assert.equal(productPack(unknown),'Confirm pack size');
});

test('catalogue buyer matching includes products beyond a lead’s four priority suggestions',()=>{
  const vanilla=products.find(product=>product.id==='6613008285859')!;
  assert.equal(productFitsLead(vanilla,{segment:'Cafés'}),true);
  assert.equal(productFitsLead(vanilla,{segment:'Hotels & resorts'}),true);
  assert.equal(productFitsLead(vanilla,{segment:'Bakeries'}),false);
});

test('sample exports retain source and pack context and escape spreadsheet formulas',()=>{
  const product={...products[0],name:'=HYPERLINK("https://example.com")',pitch:'text'};
  const csv=catalogueCsv([product]);
  assert.match(csv,/not a B2B quote/);assert.ok(csv.includes('10 Kg'));assert.ok(csv.includes(product.url));assert.ok(csv.includes(product.syncedAt));
  assert.ok(csv.includes('"\'=HYPERLINK(""https://example.com"")"'));
  assert.ok(csv.includes('Planning selection only; confirm samples, packs, MOQ and trade pricing'));
});
