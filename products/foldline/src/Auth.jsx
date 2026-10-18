import React, {useEffect,useState} from 'react';
import * as identity from '@netlify/identity';
import {beginGoogleLogin} from './session.js';
import {ArrowLeft,ArrowRight,GoogleLogo,LockKey,EnvelopeSimple} from '@phosphor-icons/react';
import {Logo,Button,Field,Notice} from './components.jsx';

export default function Auth() {
  const [mode,setMode]=useState(new URLSearchParams(location.search).get('mode')==='signup'?'signup':'login');
  const [settings,setSettings]=useState(null);
  const [settingsError,setSettingsError]=useState('');
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [busy,setBusy]=useState(false);
  const [emailOpen,setEmailOpen]=useState(false);
  useEffect(()=>{
    let active=true;
    identity.getSettings().then(value=>{
      if(typeof value?.autoconfirm!=='boolean'||typeof value?.disableSignup!=='boolean')throw Error('Invalid account settings.');
      if(active)setSettings(value);
    }).catch(()=>{if(active)setSettingsError('Sign-in is unavailable right now. Please try again shortly.');});
    return()=>{active=false;};
  },[]);
  function changeMode(next){setMode(next);setError('');setMessage('');setEmailOpen(true);}
  async function submit(event){
    event.preventDefault();setBusy(true);setError('');setMessage('');
    const data=Object.fromEntries(new FormData(event.currentTarget));
    try {
      if(mode==='signup'){
        await identity.signup(data.email,data.password,{full_name:data.name});
        if(settings?.autoconfirm)location.replace('/app');
        else setMessage('Check your email for a confirmation link. Once confirmed, your workspace will be ready to create.');
      }else if(mode==='recover'){
        await identity.requestPasswordRecovery(data.email);
        setMessage('If this address has an account, a reset link is on its way.');
      }else{await identity.login(data.email,data.password);location.replace('/app');}
    }catch(err){setError(err.message||'Sign-in could not be completed. Please try again.');}
    finally{setBusy(false);}
  }
  function googleLogin(){
    if(!settings?.providers?.google)return;
    setError('');setBusy(true);
    try{beginGoogleLogin();}catch(err){setBusy(false);setError(err.message);}
  }
  return <main className="auth-page">
    <div className="auth-navigation"><Logo/><a className="text-button" href="/"><ArrowLeft size={17}/>Back to the product</a></div>
    <section className="auth-scene" aria-label="Foldline"><div className="auth-art"><img src="/brand/foldline-fold.svg" alt="An orange folded ribbon, turning loose ends into one direction"/></div><div className="auth-message"><span className="eyebrow">A place for the next step.</span><h1>Less lost<br/>in the loop.</h1><p>Collect the problem. Make the call.<br/>Show what changed.</p></div><div className="auth-caption"><span>Feedback → Decision → Release</span><span>Foldline</span></div></section>
    <section className="auth-form-region"><div className="auth-form-wrap"><span className="eyebrow">YOUR FOLDLINE WORKSPACE</span><h2>{mode==='recover'?'Find your way back.':'Good listening starts here.'}</h2><p>{mode==='recover'?'We’ll email you a link to reset your password.':'Sign in to bring your customer feedback together.'}</p>
      {mode!=='recover'&&<><Button className="google-button" onClick={googleLogin} disabled={busy||!settings?.providers?.google}><GoogleLogo size={23} weight="bold"/>{busy?'Connecting…':'Continue with Google'}<ArrowRight size={18}/></Button>{!settings&&!settingsError?<p className="auth-provider-note" role="status">Checking sign-in options…</p>:!settings?.providers?.google&&!settingsError?<p className="auth-provider-note">Google sign-in is not available yet. You can use email below.</p>:settings?.providers?.google?<p className="auth-provider-note">Your Google account works for sign-up and sign-in.</p>:null}<div className="auth-divider"><span>or</span></div><button className="email-toggle" aria-expanded={emailOpen} onClick={()=>setEmailOpen(!emailOpen)}><EnvelopeSimple size={19}/>Continue with email <span>{emailOpen?'−':'+'}</span></button></>}
      <Notice error>{settingsError||error}</Notice>
      {(emailOpen||mode==='recover')&&<div className="email-fields"><div className="auth-mode-switch">{mode!=='recover'&&['login','signup'].map(value=><button key={value} className={mode===value?'active':''} onClick={()=>changeMode(value)}>{value==='login'?'Log in':'Create account'}</button>)}</div>
        <form className="form-stack" onSubmit={submit}>{mode==='signup'&&<Field label="Your name" name="name" autoComplete="name" maxLength={120} required/>}<Field label="Email address" name="email" type="email" autoComplete="email" required placeholder="you@yourcompany.com"/>{mode!=='recover'&&<Field label="Password" name="password" type="password" autoComplete={mode==='signup'?'new-password':'current-password'} minLength={8} required hint={mode==='signup'?'At least 8 characters.':undefined}/>}
          {settings?.disableSignup&&mode==='signup'&&<Notice>New email accounts are invitation-only for now. You can log in with an existing account.</Notice>}<Notice>{message}</Notice><Button className="primary full" disabled={busy||!settings||!!settingsError||(mode==='signup'&&settings.disableSignup)}>{busy?'One moment…':mode==='signup'?'Create your account':mode==='recover'?'Send reset link':'Log in with email'}<ArrowRight size={18}/></Button>
        </form><button className="text-button auth-recover" onClick={()=>changeMode(mode==='recover'?'login':'recover')}>{mode==='recover'?'Back to sign-in':'Forgot your password?'}</button>
      </div>}
      <p className="auth-footnote"><LockKey size={15}/>Customer context and decision notes stay private.</p><p className="auth-legal">By continuing, you agree to our <a href="/terms">terms</a> and <a href="/privacy">privacy policy</a>.</p>
    </div></section>
  </main>;
}
