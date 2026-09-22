import { randomUUID } from 'node:crypto';
import type { Store } from './db.js';
import { scoreLead } from './scoring.js';
import type { Lead, Product, Segment, Stage, Automation } from '../shared/types.js';

const businesses: [string,Segment,string][] = [
 ['Juniper & Co.','Cafés','Hauz Khas'],['The Fern Table','Restaurants','Bandra West'],['Amber House','Hotels & resorts','Indiranagar'],
 ['Little Grain Bakehouse','Bakeries','Greater Kailash'],['Sunday People','Cafés','Powai'],['Botanical Social','Bars & lounges','Koramangala'],
 ['The Copper Courtyard','Restaurants','Aerocity'],['Olive & Oak Hotel','Hotels & resorts','Juhu'],['Morning Ritual','Cafés','Whitefield'],
 ['Gather & Graze','Caterers','Gurugram'],['Butterfield Baking Co.','Bakeries','Lower Parel'],['Saffron Spoon','Sweet shops','Jayanagar'],
 ['Paper Boat Coffeehouse','Cafés','Noida'],['The Marigold Room','Restaurants','Fort'],['The Grove Residency','Hotels & resorts','MG Road'],
 ['Wildflour Kitchen','Bakeries','Saket'],['Common Ground Café','Cafés','Andheri'],['Terrace Eleven','Bars & lounges','HSR Layout'],
 ['Meadow Hospitality','Caterers','Vasant Kunj'],['Cedar & Salt','Restaurants','Worli'],['The Daily Crumb','Bakeries','JP Nagar'],
 ['Golden Leaf Suites','Hotels & resorts','Dwarka'],['Brew & Bloom','Cafés','Colaba'],['Aangan Sweets','Sweet shops','Malleshwaram'],
 ['Bluebird Coffee Studio','Cafés','Connaught Place'],['The Pantry Collective','Distributors','Vashi'],['Sundown Stories','Bars & lounges','Church Street'],
 ['Harvest Table','Restaurants','Faridabad'],['Casa Verde Stay','Hotels & resorts','Malad'],['Cocoa Lane','Bakeries','Bellandur'],
 ['The Good Bean','Cafés','Shahpur Jat'],['Thyme & Tide','Restaurants','Versova'],['Gathering Company','Caterers','Hebbal'],
 ['Hearth & Honey','Bakeries','Defence Colony'],['Palm House Café','Cafés','Bandra East'],['Maple Leaf Suites','Hotels & resorts','Ulsoor'],
 ['Nectar & Co.','Sweet shops','Pitampura'],['The Supper Clubhouse','Restaurants','Chembur'],['Third Garden Coffee','Cafés','Marathahalli'],
 ['Tamarind Events','Caterers','Ghaziabad'],['City Provisions','Distributors','Thane'],['The Glasshouse Lounge','Bars & lounges','Richmond Town'],
 ['Roast & Root','Cafés','Lodhi Colony'],['The Orchard Inn','Hotels & resorts','Churchgate'],['Golden Crust Studio','Bakeries','Basavanagudi']
];
export function seed(store:Store, products:Product[]) {
  for(const product of products)store.put('products',product);
  if(store.get('meta','seed-v1'))return;
  const stagePattern:Stage[]=['New','Qualified','New','Sample sent','New','Contacted','Negotiation','Qualified','New','Won','Contacted','Sample sent'];
  businesses.forEach(([name,segment,area],i)=>{
    const city=['Delhi NCR','Mumbai','Bengaluru'][i%3];
    const createdAt=new Date(Date.now()-(Math.floor(i/2)*86400000+i*17000)).toISOString();
    const lead:Lead={id:randomUUID(),name,segment,area,city,stage:stagePattern[i%stagePattern.length],score:0,scoreReasons:[],products:[],email:i%4===0?'':`${name.toLowerCase().replace(/[^a-z]/g,'')}@sample.example`,phone:'',website:`https://${name.toLowerCase().replace(/[^a-z]/g,'')}.example`,source:'Sample dataset',sourceUrl:'',sourceId:`sample-${i}`,sourceAt:createdAt,rating:Number((4.2+(i%7)/10).toFixed(1)),reviews:72+i*19,value:[18000,32000,75000,24000,15000,38000][i%6],valueBasis:'Illustrative monthly opportunity, not a quote or forecast.',owner:i%3===0?'Aarav':'You',notes:[],tags:[segment==='Cafés'?'Coffee service':segment==='Bakeries'?'Pastry kitchen':segment==='Hotels & resorts'?'Hospitality':'Food service'],saved:i%4===0,demo:true,createdAt,updatedAt:createdAt,nextFollowUp:i%7===0?new Date(Date.now()+86400000).toISOString().slice(0,10):'',suppressed:false,emailSource:i%4===0?'':'Fictional example email',aiSummary:'',aiGenerated:false};
    Object.assign(lead,scoreLead(lead,products,store.settings().targetCities));
    store.saveLead(lead);
  });
  const now=new Date().toISOString();
  const automation:Automation={id:randomUUID(),name:'Find your next café partner',cities:['Delhi NCR','Mumbai','Bengaluru'],segments:['Cafés'],frequency:'daily',enabled:false,mode:'demo',minScore:70,draftOutreach:true,lastRun:null,nextRun:new Date(Date.now()+86400000).toISOString(),createdAt:now};
  store.put('automations',automation);
  store.activity('Your workspace is ready. Explore 45 illustrative hospitality leads.',true,'system');
  store.activity(`${products.length} real Dhampur Green products mapped to hospitality buyers.`,true,'product');
  store.put('meta',{id:'seed-v1',createdAt:now});
}
