import * as identity from '@netlify/identity';
import {api} from './api.js';

// Hydrate first. getUser() schedules refresh but does not await it.
// The server's verified response is the only authority for private app state.
export async function loadVerifiedSession(client=identity,readSession=()=>api('/session')){
  await client.getUser();
  await client.refreshSession();
  return readSession();
}
export function beginGoogleLogin(client=identity){
  try{client.oauthLogin('google');}
  catch(error){
    // SDK 2 intentionally throws this sentinel after assigning the OAuth URL.
    if(error?.message!=='Redirecting to OAuth provider')throw error;
  }
  return {redirecting:true};
}
export function consumeOAuthError(locationLike,historyLike){
  const params=new URLSearchParams(locationLike.hash.replace(/^#/,''));
  if(!params.has('error')&&!params.has('error_description'))return null;
  const canceled=params.get('error')==='access_denied';
  // Never reflect provider descriptions or leave a mixed error/token hash behind.
  historyLike.replaceState(null,'',locationLike.pathname+locationLike.search);
  return canceled
    ? 'Sign-in was canceled. Nothing was changed. You can try Google again or continue with email.'
    : 'Sign-in could not be completed. Try again or continue with email.';
}

// Invalidate async work whenever the private session changes or leaves the page.
export function createSessionGuard(){
  let generation=0;
  return {capture:()=>generation,invalidate:()=>++generation,isCurrent:token=>token===generation};
}
