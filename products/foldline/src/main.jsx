import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import * as identity from '@netlify/identity';
import {ArrowRight} from '@phosphor-icons/react';
import '@fontsource-variable/manrope';
import '@fontsource-variable/bricolage-grotesque';
import Landing from './Landing.jsx';
import Auth from './Auth.jsx';
import Workspace from './Workspace.jsx';
import PublicBoard from './PublicBoard.jsx';
import Legal from './Legal.jsx';
import {Header,Footer,Button,Field,Notice,Loading} from './components.jsx';
import {consumeOAuthError} from './session.js';
import './style.css';

function App(){
  const [oauthError]=useState(()=>consumeOAuthError(location,history));
  const hasCallback=/(?:confirmation|recovery|invite|access|email_change)_token/.test(location.hash);
  const [processing,setProcessing]=useState(hasCallback&&!oauthError);
  const [callback,setCallback]=useState(null);
  const [callbackError,setCallbackError]=useState(oauthError||'');
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    if(oauthError)return;
    if(!hasCallback)return;
    identity.handleAuthCallback().then(result=>{
      if(result?.type==='recovery'||result?.type==='invite'){setCallback(result);setProcessing(false);}
      else if(result)location.replace('/app');
      else setProcessing(false);
    }).catch(()=>{history.replaceState(null,'',location.pathname+location.search);setCallbackError('This sign-in link is invalid or has expired. Please try signing in again.');setProcessing(false);});
  },[]);
  if(processing)return <><Header/><Loading label="Connecting your account…"/></>;
  if(callback||callbackError)return <><Header/><main className="recovery-page page-width"><div><span className="eyebrow">YOUR FOLDLINE ACCOUNT</span><h1>{!callback?"Sign-in wasn't completed.":callback.type==='invite'?'A little room for you.':'Find your way back.'}</h1>{callback?<><p>Set a new password to continue to your workspace.</p><form className="form-stack" onSubmit={async event=>{event.preventDefault();setBusy(true);setCallbackError('');try{const password=new FormData(event.currentTarget).get('password');if(callback.type==='invite')await identity.acceptInvite(callback.token,password);else await identity.updateUser({password});location.replace('/app');}catch(err){setCallbackError(err.message);}finally{setBusy(false);}}}><Field label="New password" type="password" name="password" required minLength={8} autoComplete="new-password"/><Notice error>{callbackError}</Notice><Button className="primary" disabled={busy}>{busy?'Saving…':'Set password'}<ArrowRight size={18}/></Button></form></>:<><Notice error>{callbackError}</Notice><a className="button" href="/auth">Back to sign-in</a></>}</div></main><Footer/></>;
  const path=location.pathname.replace(/\/$/,'')||'/';
  if(path==='/')return <Landing/>;
  if(path==='/auth')return <Auth/>;
  if(path==='/app')return <Workspace/>;
  if(path.startsWith('/b/'))return <PublicBoard/>;
  if(path==='/privacy'||path==='/terms')return <Legal privacy={path==='/privacy'}/>;
  return <><Header/><main className="page-width recovery-page"><h1>A loose end.</h1><p>This page doesn't exist.</p><a className="button primary" href="/">Back to Foldline <ArrowRight size={18}/></a></main><Footer/></>;
}
createRoot(document.getElementById('root')).render(<App/>);
