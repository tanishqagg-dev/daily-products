import React, {useEffect, useRef, useId} from 'react';
import {ArrowUpRight, ArrowRight, Check, Circle, X, CheckCircle, WarningCircle} from '@phosphor-icons/react';
import {statusLabels} from './api.js';

export function Logo({small=false}) {
  return <a href="/" className={`logo ${small?'small':''}`} aria-label="Foldline home">
    <svg width="34" height="34" viewBox="0 0 40 40" fill="none" aria-hidden="true"><path d="M5 31V9h29L20 23H11M20 23v8h14" stroke="currentColor" strokeWidth="3.2" strokeLinejoin="round"/><path d="m20 23 14-14v22" stroke="currentColor" strokeWidth="1.4"/></svg>
    <span>foldline<span className="logo-stop">.</span></span>
  </a>;
}
export function Header() {
  return <header className="site-header"><Logo/><nav aria-label="Main"><a href="/#workflow">How it works</a><a href="/#pricing">Pricing</a><a className="button compact" href="/auth">Open workspace <ArrowUpRight size={17}/></a></nav></header>;
}
export function Footer() {
  return <footer><Logo small/><p>Listen closely. Follow through.</p><nav aria-label="Legal"><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/THIRD_PARTY_NOTICES.txt">Licenses</a><a href="https://tanishq.work">By Tanishq <ArrowUpRight size={15}/></a></nav></footer>;
}
export function Button({children,className='',...props}) {
  return <button className={`button ${className}`} {...props}>{children}</button>;
}
export function Notice({children,error=false}) {
  if(!children)return null;
  return <div className={`notice ${error?'error':''}`} role={error?'alert':'status'}>{error?<WarningCircle size={19}/>:<CheckCircle size={19}/>}<span>{children}</span></div>;
}
export function Field({label,hint,textarea=false,...props}) {
  const Tag=textarea?'textarea':'input';
  const hintId=useId();
  return <label className="field"><span>{label}</span><Tag aria-label={label} aria-describedby={hint?hintId:undefined} {...props}/>{hint&&<small id={hintId}>{hint}</small>}</label>;
}
export function Status({value}) {
  return <span className={`status ${value}`}>{value==='shipped'?<Check size={14} weight="bold"/>:<Circle size={11} weight={value==='planned'?'fill':'regular'}/>} {statusLabels[value]||value}</span>;
}
export function RequestForm({onSubmit,busy,buttonText='Send feedback',publicForm=false}) {
  return <form className="form-stack" onSubmit={event=>{event.preventDefault();onSubmit(Object.fromEntries(new FormData(event.currentTarget)),event.currentTarget);}}>
    <Field label="Give it a short title" name="title" maxLength={160} required placeholder="What could work better?" hint={publicForm?'This title will be visible on the public board.':undefined}/>
    <Field label="What were you trying to do?" name="problem" textarea rows={4} maxLength={4000} required placeholder="Tell us where you got stuck."/>
    <Field label="What do you do instead?" name="workaround" textarea rows={3} maxLength={2000} placeholder="A workaround, a spreadsheet, a few extra clicks…" hint={publicForm?'The problem and workaround are shared only with the workspace owner.':undefined}/>
    <Button className="primary" disabled={busy}>{busy?'Sending…':buttonText}<ArrowRight size={18}/></Button>
  </form>;
}
export function Modal({title,onClose,children}) {
  const ref=useRef(null);
  useEffect(()=>{const previous=document.activeElement;const el=ref.current;el.showModal();const cancel=e=>{e.preventDefault();onClose();};el.addEventListener('cancel',cancel);return()=>{el.removeEventListener('cancel',cancel);el.close();previous?.focus();};},[]);
  return <dialog ref={ref} className="modal"><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={22}/></button></div>{children}</dialog>;
}
export function Loading({label='Opening your workspace…'}) {
  return <div className="loading-state" role="status"><span className="loading-fold"/><p>{label}</p></div>;
}
