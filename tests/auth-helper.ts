// Test servers use real owner authentication; no development bypass is enabled.
const nativeFetch=globalThis.fetch;
export const testOwnerPassword='test-owner-password-123456';
export function configureTestOwner(){process.env.ADMIN_PASSWORD ||= testOwnerPassword;}
export async function ownerCookie(base:string){
  const response=await nativeFetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json','X-Requested-With':'Grow'},body:JSON.stringify({email:process.env.ADMIN_EMAIL||'admin@dhampurgreen.com',password:process.env.ADMIN_PASSWORD})});
  if(!response.ok)throw new Error('Test owner sign-in failed: '+response.status);
  return response.headers.get('set-cookie')!.split(';')[0];
}
