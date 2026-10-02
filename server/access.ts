import { Router, type Request, type Response, type NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Store } from './db.js';
import type { AccessStatus, MemberAccount } from '../shared/access.js';

const hash=(value:string)=>createHash('sha256').update(value).digest('hex');
const emailSchema=z.string().trim().email().max(200).transform(value=>value.toLowerCase());
const newPassword=z.string().min(12,'Use at least 12 characters.').max(72,'Use at most 72 characters.').refine(value=>Buffer.byteLength(value,'utf8')<=72,'Use at most 72 UTF-8 bytes.');
const asyncRoute=(fn:(req:Request,res:Response)=>Promise<unknown>)=>(req:Request,res:Response,next:NextFunction)=>{void fn(req,res).catch(next);};
interface Account extends MemberAccount { password_hash: string }

export function accessControl(store:Store,readOnly:boolean) {
  const router=Router();
  const ownerEmail=(process.env.ADMIN_EMAIL||'admin@dhampurgreen.com').trim().toLowerCase();
  const password=process.env.ADMIN_PASSWORD||'';
  const previous=store.db.prepare("SELECT email,password_hash,version FROM owner_credentials WHERE id='owner'").get() as {email:string;password_hash:string;version:string}|undefined;
  const unchanged=!!password&&previous?.email===ownerEmail&&bcrypt.compareSync(password,previous.password_hash);
  const ownerHash=unchanged?previous.password_hash:bcrypt.hashSync(password||randomBytes(32).toString('hex'),12);
  // A random version binds sessions to the configured owner, without storing a fast password digest.
  const ownerVersion=unchanged?previous.version:randomBytes(32).toString('hex');
  if(!unchanged)store.db.prepare("INSERT INTO owner_credentials VALUES('owner',?,?,?) ON CONFLICT(id) DO UPDATE SET email=excluded.email,password_hash=excluded.password_hash,version=excluded.version").run(ownerEmail,ownerHash,ownerVersion);
  const secure=process.env.NODE_ENV==='production';
  const status=(req:Request):AccessStatus=>{
    const visitor:AccessStatus={authenticated:false,role:'visitor',email:null,readOnly,configured:!!password};
    const token=req.cookies.grow_session;
    if(typeof token!=='string'||!password)return visitor;
    const session=store.db.prepare('SELECT account_id, credential_version FROM access_sessions WHERE token=? AND expires>?').get(hash(token),Date.now()) as {account_id:string;credential_version:string}|undefined;
    if(!session)return visitor;
    if(session.account_id==='owner')return session.credential_version===ownerVersion?{...visitor,authenticated:true,role:'owner',email:ownerEmail}:visitor;
    const account=store.db.prepare('SELECT email FROM accounts WHERE id=?').get(session.account_id) as {email:string}|undefined;
    return account?{...visitor,authenticated:true,role:'member',email:account.email}:visitor;
  };
  const ownerOnly=(req:Request,res:Response,next:NextFunction)=>{
    const access=status(req);
    if(!access.authenticated)return res.status(401).json({error:'Please sign in to continue.'});
    if(access.role!=='owner')return res.status(403).json({error:'This section is locked. Only the platform owner has access.'});
    next();
  };
  const signedIn=(req:Request,res:Response,next:NextFunction)=>{
    if(!status(req).authenticated)return res.status(401).json({error:'Please sign in to continue.'});
    next();
  };
  const writable=(_req:Request,res:Response,next:NextFunction)=>readOnly?res.status(503).json({error:'Account changes require the persistent private workspace.'}):next();
  router.get('/auth/status',(req,res)=>res.json({...status(req),required:true}));
  router.post('/auth/login',rateLimit({windowMs:900000,limit:10,message:{error:'Too many login attempts. Please wait 15 minutes.'}}),asyncRoute(async(req,res)=>{
    const input=z.object({email:emailSchema,password:z.string().max(200)}).strict().parse(req.body);
    const account=input.email===ownerEmail?undefined:store.db.prepare('SELECT * FROM accounts WHERE email=?').get(input.email) as Account|undefined;
    const correct=await bcrypt.compare(input.password,account?.password_hash||ownerHash);
    if(!password||!correct||(!account&&input.email!==ownerEmail))return res.status(401).json({error:'Incorrect email or password.'});
    // An account may have been revoked or its password changed while bcrypt was running.
    if(account&&!store.db.prepare('SELECT id FROM accounts WHERE id=? AND password_hash=?').get(account.id,account.password_hash))return res.status(401).json({error:'Incorrect email or password.'});
    const token=randomBytes(32).toString('hex');
    store.db.prepare('DELETE FROM access_sessions WHERE expires<?').run(Date.now());
    if(typeof req.cookies.grow_session==='string')store.db.prepare('DELETE FROM access_sessions WHERE token=?').run(hash(req.cookies.grow_session));
    store.db.prepare('INSERT INTO access_sessions VALUES(?,?,?,?)').run(hash(token),Date.now()+7*86400000,account?.id||'owner',account?'':ownerVersion);
    res.cookie('grow_session',token,{httpOnly:true,sameSite:'lax',secure,maxAge:7*86400000,path:'/'}).json({ok:true});
  }));
  router.post('/auth/logout',(req,res)=>{
    if(typeof req.cookies.grow_session==='string')store.db.prepare('DELETE FROM access_sessions WHERE token=?').run(hash(req.cookies.grow_session));
    res.clearCookie('grow_session',{path:'/'}).json({ok:true});
  });
  router.get('/credentials/accounts',ownerOnly,(_req,res)=>res.json(store.db.prepare('SELECT id,email,createdAt FROM accounts ORDER BY createdAt DESC').all()));
  router.post('/credentials/accounts',ownerOnly,writable,asyncRoute(async(req,res)=>{
    const input=z.object({email:emailSchema,password:newPassword}).strict().parse(req.body);
    if(input.email===ownerEmail)return res.status(409).json({error:'This email belongs to the platform owner.'});
    const passwordHash=await bcrypt.hash(input.password,12);
    const account={id:randomUUID(),email:input.email,createdAt:new Date().toISOString()};
    store.db.prepare('INSERT INTO accounts VALUES(?,?,?,?)').run(account.id,account.email,passwordHash,account.createdAt);
    res.status(201).json(account);
  }));
  router.delete('/credentials/accounts/:id',ownerOnly,writable,(req,res)=>{
    store.db.transaction(()=>{
      store.db.prepare('DELETE FROM access_sessions WHERE account_id=?').run(req.params.id);
      store.db.prepare('DELETE FROM accounts WHERE id=?').run(req.params.id);
    })();
    res.json({ok:true});
  });
  router.post('/credentials/password',writable,rateLimit({windowMs:900000,limit:10,message:{error:'Too many password attempts. Please wait 15 minutes.'}}),asyncRoute(async(req,res)=>{
    const access=status(req);
    if(!access.authenticated)return res.status(401).json({error:'Please sign in to continue.'});
    if(access.role!=='member')return res.status(403).json({error:'Owner credentials are managed in the server environment.'});
    const input=z.object({currentPassword:z.string().max(200),password:newPassword}).strict().parse(req.body);
    const account=store.db.prepare('SELECT * FROM accounts WHERE email=?').get(access.email) as Account|undefined;
    if(!account||!await bcrypt.compare(input.currentPassword,account.password_hash))return res.status(400).json({error:'The current password is incorrect.'});
    const passwordHash=await bcrypt.hash(input.password,12);
    const updated=store.db.transaction(()=>{
      const result=store.db.prepare('UPDATE accounts SET password_hash=? WHERE id=? AND password_hash=?').run(passwordHash,account.id,account.password_hash);
      if(result.changes)store.db.prepare('DELETE FROM access_sessions WHERE account_id=?').run(account.id);
      return result.changes;
    })();
    if(!updated)return res.status(409).json({error:'Your account changed. Sign in again.'});
    res.clearCookie('grow_session',{path:'/'}).json({ok:true});
  }));
  // Keep unknown credential/auth URLs from falling through to workspace routes.
  router.use(['/credentials','/auth'],(_req,res)=>res.status(404).json({error:'This account endpoint does not exist.'}));
  return {router,ownerOnly,signedIn};
}
