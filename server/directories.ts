import { load } from 'cheerio';
import { createHash } from 'node:crypto';
import type { DirectorySource, Lead } from '../shared/types.js';

export type PublishedBusiness = Pick<Lead,'id'|'name'|'city'|'segment'|'area'|'website'|'sourceUrl'|'sourceAt'|'phone'|'email'|'contactContext'|'brand'|'directoryId'>;
const markets = [
  ['delhi','Delhi NCR'],['gurgaon','Delhi NCR'],['noida','Delhi NCR'],['faridabad','Delhi NCR'],['ghaziabad','Delhi NCR'],
  ['mumbai','Mumbai'],['navi-mumbai','Mumbai'],['thane','Mumbai'],['bangalore','Bengaluru'],
  ['hyderabad','Hyderabad'],['pune','Pune'],['chennai','Chennai'],['jaipur','Jaipur'],['goa','Goa'],['ahmedabad','Ahmedabad'],
] as const;
export const directorySources:DirectorySource[] = [
  ...markets.map(([slug,city]):DirectorySource=>({id:`theobroma-${slug}`,name:`Theobroma · ${slug.replaceAll('-',' ')}`,brand:'Theobroma',city,segment:'Bakeries',url:`https://theobroma.in/pages/theobroma-store-in-${slug}`,parser:'theobroma'})),
  {id:'blue-tokai-delhi',name:'Blue Tokai · Delhi',brand:'Blue Tokai',city:'Delhi NCR',segment:'Cafés',url:'https://bluetokaicoffee.com/pages/close-to-home',parser:'blue-tokai'},
];
const clean=(s:string)=>s.replace(/\s+/g,' ').trim();
const postalPrefixes:Record<string,RegExp>={'Delhi NCR':/^(11|12|20)/,Mumbai:/^(40|41|42)/,Bengaluru:/^56/,Hyderabad:/^50/,Pune:/^41/,Chennai:/^60/,Jaipur:/^30/,Goa:/^403/,Ahmedabad:/^38/};
export const normalizeFact=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]/g,'');
export const comparableFact=(field:string,value:string)=>field==='phone'?value.replace(/\D/g,'').replace(/^(?:91(?=\d{10}$)|0(?=\d{10}$))/,''):normalizeFact(value);
export function branchKey(name:string) {
  return normalizeFact(name.replace(/^.*?\s[—|]\s/,'').replace(/^Blue Tokai Coffee Roasters\s*[-|]?\s*/i,'').replace(/(?:,?\s*[-–]?\s*)(?:gurugram|gurgaon|new delhi|delhi|mumbai|bengaluru|bangalore)$/i,''));
}
function business(source:DirectorySource,branch:string,area:string,phone:string,checkedAt:string):PublishedBusiness {
  const name=`${source.brand} — ${branch}`;
  return {id:`directory-${createHash('sha256').update(`${source.id}:${branchKey(name)}`).digest('hex').slice(0,24)}`,name,city:source.city,segment:source.segment,area,phone,email:'',website:source.url,sourceUrl:source.url,sourceAt:checkedAt,brand:source.brand,directoryId:source.id,
    contactContext:phone?'Branch phone published by the business. Ask who handles ingredient purchasing; the chain may buy centrally.':'Official branch address. A branch phone or email is not published in this directory. Ask the brand who handles purchasing; branches may share a central kitchen.'};
}
export function parseDirectory(source:DirectorySource,html:string,checkedAt:string):PublishedBusiness[] {
  const $=load(html);const records:PublishedBusiness[]=[];
  if(source.parser==='theobroma')$('.outlet').each((_i,element)=>{
    const heading=clean($(element).find('h3').text());
    if(!/^Theobroma Bakery Store in /i.test(heading))return;
    const branch=heading.replace(/^Theobroma Bakery Store in /i,'');
    const paragraphs=$(element).find('p').map((_i,p)=>clean($(p).text())).get();
    const address=paragraphs.filter(p=>p&&!/Store Timings|ORDER ONLINE|STORE HOURS/i.test(p)).join(' ');
    // Reject broken selectors and partial promotional text instead of inventing a location.
    if(!/\b[1-9]\d{5}\b/.test(address)||address.length<15||address.length>600)return;
    // City landing pages occasionally include another city's branch. Do not relabel it as the selected market.
    if(!(address.match(/\b[1-9]\d{5}\b/g)??[]).some(pin=>postalPrefixes[source.city]?.test(pin)))return;
    records.push(business(source,branch,address,'',checkedAt));
  });
  else $('.cafeitemgm').each((_i,element)=>{
    const heading=clean($(element).find('h3').text());
    const branch=heading.replace(/^Blue Tokai Coffee Roasters\s*[-|]?\s*/i,'').replace(/, Delhi$/i,'');
    const area=clean($(element).find('p').filter((_i,p)=>$(p).find('img[alt="location"]').length>0).text());
    const phone=clean($(element).find('p').filter((_i,p)=>$(p).find('img[alt="phone"]').length>0).text());
    if(!branch||!area||!/delhi|gurgaon|gurugram|noida/i.test(area))return;
    records.push(business(source,branch,area,/^[+\d\s()-]{8,25}$/.test(phone)?phone:'',checkedAt));
  });
  // Some directories accidentally repeat a full street address under different branch names.
  // Do not choose which name is correct. Exclude those ambiguous records from automatic import.
  const ambiguous=new Set(records.filter(record=>source.parser==='theobroma'&&records.some(other=>other.id!==record.id&&normalizeFact(other.area)===normalizeFact(record.area))).map(record=>record.id));
  const accepted=records.filter(record=>!ambiguous.has(record.id));
  if(!accepted.length)throw new Error('No unambiguous complete locations found. The source layout may have changed; existing records were kept.');
  return [...new Map(accepted.map(record=>[record.id,record])).values()];
}
export async function fetchDirectory(source:DirectorySource):Promise<PublishedBusiness[]> {
  // The caller chooses a registry ID, never a user-supplied URL. Redirects cannot reach private servers.
  if(!directorySources.some(item=>item.id===source.id&&item.url===source.url))throw new Error('Unknown research source.');
  const response=await fetch(source.url,{redirect:'error',headers:{'User-Agent':'DhampurGreenGrow/1.0 (business directory research)','Accept':'text/html'},signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error(`Official directory returned HTTP ${response.status}. Existing records were kept.`);
  if(!response.headers.get('content-type')?.includes('text/html'))throw new Error('The directory did not return an HTML page.');
  const reader=response.body?.getReader();if(!reader)throw new Error('The source returned an empty page.');
  const chunks:Uint8Array[]=[];let length=0;
  try {for(;;){const {value,done}=await reader.read();if(done)break;length+=value.byteLength;if(length>3_000_000)throw new Error('The directory exceeded the page size limit.');chunks.push(value);}}
  finally {await reader.cancel();}
  return parseDirectory(source,Buffer.concat(chunks).toString('utf8'),new Date().toISOString());
}
