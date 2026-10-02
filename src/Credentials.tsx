import { useEffect, useState } from 'react';
import { KeyRound, ShieldCheck, LockKeyhole, LogOut, Plus, Trash2, ArrowRight } from 'lucide-react';
import type { AccessStatus, MemberAccount } from '../shared/access';
import { api, Button, Modal, PageHeading } from './lib';

export function Credentials({access,onSessionChange}:{access:AccessStatus;onSessionChange:()=>Promise<void>}) {
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [currentPassword,setCurrentPassword]=useState('');
  const [confirmation,setConfirmation]=useState('');
  const [accounts,setAccounts]=useState<MemberAccount[]>([]);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [revoking,setRevoking]=useState<MemberAccount|null>(null);
  const owner=access.role==='owner';
  const loadAccounts=async()=>setAccounts(await api<MemberAccount[]>('/credentials/accounts'));
  useEffect(()=>{if(owner)void loadAccounts().catch(err=>setError(err.message));},[owner]);
  const perform=async(action:()=>Promise<void>)=>{setBusy(true);setError('');setMessage('');try{await action();}catch(err){setError((err as Error).message);}finally{setBusy(false);}};
  const logout=()=>perform(async()=>{await api('/auth/logout',{});await onSessionChange();});
  return <div className="credentials-page">
    <PageHeading eyebrow="WORKSPACE ACCESS" title="Credentials" description={owner?'Your account has full access. Give each team member their own ingredient-only account.':'Manage your sign-in credentials. Your account can use the Ingredient buyers section.'}>
      {access.authenticated&&<Button variant="secondary" icon={LogOut} busy={busy} onClick={()=>void logout()}>Sign out</Button>}
    </PageHeading>
    {error&&<p className="inline-warning" role="alert">{error}</p>}
    {message&&<p className="credential-success" role="status">{message}</p>}
    <div className="credentials-layout">
      <section className="card credential-card">
        <span className="credential-symbol"><KeyRound size={24}/></span>
        <h2>{owner?'Owner account':access.authenticated?'Your account':'Sign in to your account'}</h2>
        {access.authenticated?<><p className="credential-email">{access.email}</p><span className={`badge ${owner?'green':'gray'}`}>{owner?'Owner · Full access':'Member · Ingredient access'}</span></>:<p>Use the email and password provided by the platform owner.</p>}
        {!access.authenticated&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('/auth/login',{email,password});setPassword('');await onSessionChange();});}}>
          <label>Work email<input type="email" autoComplete="username" required value={email} onChange={e=>setEmail(e.target.value)}/></label>
          <label>Password<input type="password" autoComplete="current-password" required maxLength={200} value={password} onChange={e=>setPassword(e.target.value)}/></label>
          <Button busy={busy} disabled={!access.configured} icon={ArrowRight}>Sign in to Grow</Button>
          {!access.configured&&<p className="small muted">The owner needs to configure sign-in before this workspace can be opened.</p>}
        </form>}
        {owner&&<p className="small muted">Your owner email and password are managed in the server configuration. Changing them invalidates existing owner sessions.</p>}
        {access.role==='member'&&<form className="form-stack" onSubmit={e=>{e.preventDefault();void perform(async()=>{
          if(password!==confirmation)throw new Error('The new passwords do not match.');
          await api('/credentials/password',{currentPassword,password});setPassword('');setCurrentPassword('');setConfirmation('');await onSessionChange();
        });}}>
          <h3>Change your password</h3>
          <label>Current password<input type="password" autoComplete="current-password" required maxLength={200} value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/></label>
          <label>New password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={password} onChange={e=>setPassword(e.target.value)}/></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} value={confirmation} onChange={e=>setConfirmation(e.target.value)}/></label>
          <p className="small muted">Use at least 12 characters. You will sign in again on all devices after changing your password.</p>
          <Button disabled={access.readOnly} busy={busy} icon={KeyRound}>Update password & sign out</Button>
        </form>}
      </section>
      <section className="credential-access card"><ShieldCheck size={26}/><h2>{owner?'You control access':'A private workspace'}</h2><p>{owner?'Create a separate account for each person you share the platform with. Members can work only in Ingredient buyers.':'You can use ingredient research and manage your own password. Other workspace sections remain locked.'}</p><div className="credential-permission"><KeyRound size={18}/><span>Credentials</span><strong>Available</strong></div><div className="credential-permission"><ShieldCheck size={18}/><span>Ingredient buyers</span><strong>Available</strong></div><div className="credential-permission"><LockKeyhole size={18}/><span>All other sections</span><strong>{owner?'Full access':'Locked'}</strong></div><p className="small muted">{owner?'Your leads, reports, integrations and settings stay accessible only to you.':'Only the owner can open leads, campaigns, reports, integrations and settings.'}</p></section>
    </div>
    {owner&&<section className="card credential-card credential-members"><h2>Share access</h2><p>Create an ingredient-only account, then share its email and initial password privately.</p>
      {access.readOnly?<p className="inline-warning">Creating accounts requires the persistent private workspace. Account changes are unavailable in this preview.</p>:<form className="credential-invite" onSubmit={e=>{e.preventDefault();void perform(async()=>{await api('/credentials/accounts',{email,password});setEmail('');setPassword('');await loadAccounts();setMessage('Account created. This person can access Ingredient buyers and their own credentials.');});}}>
        <label>Member email<input type="email" autoComplete="off" required maxLength={200} value={email} onChange={e=>setEmail(e.target.value)}/></label>
        <label>Initial password<input type="password" autoComplete="new-password" required minLength={12} maxLength={72} placeholder="At least 12 characters" value={password} onChange={e=>setPassword(e.target.value)}/></label>
        <Button busy={busy} icon={Plus}>Create ingredient account</Button>
      </form>}
      <div className="credential-member-list">{accounts.length?accounts.map(account=><div className="credential-member" key={account.id}><div><strong>{account.email}</strong><small>Ingredient buyers + own credentials</small></div><Button variant="ghost" disabled={busy||access.readOnly} icon={Trash2} aria-label={`Revoke access for ${account.email}`} onClick={()=>setRevoking(account)}>Revoke access</Button></div>):<p className="muted">No shared accounts yet. Only your owner account has workspace access.</p>}</div>
    </section>}
    {revoking&&<Modal title="Revoke access?" subtitle={`${revoking.email} will be signed out on every device and their account will be removed.`} onClose={()=>{if(!busy)setRevoking(null);}}><div className="modal-footer"><Button variant="secondary" disabled={busy} onClick={()=>setRevoking(null)}>Keep account</Button><Button busy={busy} onClick={()=>void perform(async()=>{await api(`/credentials/accounts/${revoking.id}`,{},'DELETE');setRevoking(null);await loadAccounts();setMessage('Access revoked. All sessions for this account have ended.');})}>Revoke access</Button></div></Modal>}
  </div>;
}
