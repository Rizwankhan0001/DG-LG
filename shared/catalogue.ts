import type { Lead, Product, ProductVariant } from './types.js';

// Sales conversation ideas, not manufacturer specifications or buyer demand.
const briefs:Record<string,{uses:string[];question:string}>={
  '7161040896163':{uses:['Coffee counters','Guest-room trays','Table service'],question:'Which beverages need a brown sugar option, and how many sachets are used in a normal week?'},
  '6613008318627':{uses:['Tea service','Sweetener assortments','Hospitality trays'],question:'Would the team like to trial a jaggery option alongside its existing beverage sweeteners?'},
  '6613008154787':{uses:['Everyday beverage service','Takeaway counters','Conference catering'],question:'What is the current sachet size and monthly use across your beverage counters?'},
  '9148457943284':{uses:['Tea & coffee counters','Breakfast service','Guest-room trays'],question:'Would desi khand suit your beverage offering, and who approves new sweetener trials?'},
  '7160839766179':{uses:['Indian desserts','Jaggery-based recipes','Baking trials'],question:'Which recipes use jaggery powder, and what quantity does each production batch require?'},
  '6613007368355':{uses:['Brownies & cookies','Dark-flavour baking','Pastry recipe trials'],question:'Which recipes need a molasses-rich sugar, and can your baker evaluate a test batch?'},
  '6613007138979':{uses:['Frosting','Dessert finishing','Pastry kitchens'],question:'How much icing sugar does your pastry team use each week, and what pack size is easiest to handle?'},
  '6613007106211':{uses:['Cakes & patisserie','Baking production','Recipe trials'],question:'Do you bake at this location or centrally, and what sugar specifications does the production team require?'},
  '9285977440500':{uses:['Café menu trials','Flavoured beverages','Dessert applications'],question:'Which drinks or desserts could use a cinnamon-caramel flavour, and what recipe dose would the team trial?'},
  '7815592476916':{uses:['Breakfast plates','Pancake service','Dessert topping trials'],question:'Do pancakes or suitable desserts feature on the menu, and how much topping is used per plate?'},
  '8155281162484':{uses:['Mocktail menus','Event beverages','Bar recipe trials'],question:'How many mojito-style drinks are prepared per service, and what mix and dose does the bartender use?'},
  '8062445027572':{uses:['Citrus mocktails','Event beverages','Bar recipe trials'],question:'Which drinks could use blue curaçao syrup, and can the bar team test it against its existing recipe?'},
  '8294713950452':{uses:['After-meal service','Banquet tables','Catered meals'],question:'Do you offer an individually packed mouth freshener, and how many diners receive one per service?'},
  '9006961819892':{uses:['Baking trials','Sauces & glazes','Chef-led recipes'],question:'Which recipes call for molasses, and what flavour and handling requirements should a trial meet?'},
  '6613008285859':{uses:['Coffee service','Flavoured sweetener options','Guest beverage trays'],question:'Would a vanilla sugar option fit your coffee service, and how many portions would you trial?'},
};
export function productBrief(product:Product){return briefs[product.id]||{uses:[product.category,'Hospitality recipe trials'],question:'Which applications, pack sizes and monthly quantities would suit your operation?'};}
export function productTitle(product:Product){
  return product.name.replace(/\s+\d+(?:\.\d+)?\s*(?:kg|gm?|ml)\b.*$/i,'').replace(/[-–]\s*$/,'').trim()||product.name;
}
export function productPack(product:Product){
  if(product.unit&&product.unit!=='Default Title')return product.unit;
  return product.name.match(/\d+(?:\.\d+)?\s*(?:kg|gm?|ml)\b.*$/i)?.[0]?.trim()||'Confirm pack size';
}
export function productVariants(product:Product):ProductVariant[]{
  return product.variants?.length?product.variants:[{id:'snapshot',title:productPack(product),price:product.price}];
}
export function productFitsLead(product:Product,lead:Pick<Lead,'segment'>){return product.segments.includes(lead.segment);}
export function catalogueCsv(products:Product[]){
  const cell=(value:unknown)=>{let text=String(value??'');if(/^[\s]*[=+@\-\t\r]/.test(text))text="'"+text;return '"'+text.replaceAll('"','""')+'"';};
  const rows=[['Product','Category','Recorded pack / variant','Retail snapshot INR (not a B2B quote)','Suggested buyer categories','Suggested uses (not confirmed requirements)','Official product URL','Snapshot date','Selection status'],...products.map(product=>[product.name,product.category,productPack(product),product.price,product.segments.join('; '),productBrief(product).uses.join('; '),product.url,product.syncedAt,'Planning selection only; confirm samples, packs, MOQ and trade pricing'])];
  return '\uFEFF'+rows.map(row=>row.map(cell).join(',')).join('\r\n');
}
