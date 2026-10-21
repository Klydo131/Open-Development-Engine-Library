import React, {useState} from 'react';
type Props={busy:boolean;error:string;hasOriginal:boolean;save:(current:string,next:string)=>Promise<boolean>};
export function PassphraseForm({busy,error,hasOriginal,save}:Props){
 const [validation,setValidation]=useState('');
 return <form className="modal-body" onSubmit={e=>{
  e.preventDefault();const form=e.currentTarget;const data=new FormData(form);const current=String(data.get('currentPassphrase'));const next=String(data.get('nextPassphrase'));setValidation('');
  if(next!==data.get('confirmPassphrase')){setValidation('The new passphrases do not match.');return;}
  void save(current,next).then(ok=>{if(ok&&form.isConnected)form.reset();});
 }}>
  <p>Your saved library will be encrypted with your new passphrase. Keep it safe: there is no reset service.</p>
  <p>Downloaded backups keep their original passphrases. Export a fresh backup after this change.</p>
  {hasOriginal&&<p>An older recovery copy saved in this browser will be removed. Export that copy first if you still need it.</p>}
  <label>Current passphrase<input name="currentPassphrase" type="password" autoComplete="current-password" minLength={1} maxLength={512} required/></label>
  <label>New passphrase<input name="nextPassphrase" type="password" autoComplete="new-password" minLength={12} maxLength={512} required/></label>
  <label>Confirm new passphrase<input name="confirmPassphrase" type="password" autoComplete="new-password" minLength={12} maxLength={512} required/></label>
  {(validation||error)&&<p className="notice error" role="alert">{validation||error}</p>}
  <button className="button full" disabled={busy}>{busy?'Changing passphrase…':'Save new passphrase'}</button>
 </form>;
}
