// Local helper/state contracts with injected doubles. These tests do not prove
// Google consent, Identity session issuance, refresh or a hosted authentication.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {loadVerifiedSession,beginGoogleLogin,consumeOAuthError} from '../../src/session.js';

const deferred=()=>{
 let resolve,reject;
 const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
 return{promise,resolve,reject};
};

test('session bootstrap waits for hydration and awaited refresh before checking server authority',async()=>{
 const hydration=deferred(),refresh=deferred(),events=[];
 const server={user:{id:'server-owner'},billingConfigured:false};
 const pending=loadVerifiedSession({getUser:()=>{events.push('hydrate');return hydration.promise;},refreshSession:()=>{events.push('refresh');return refresh.promise;}},async()=>{events.push('server');return server;});
 assert.deepEqual(events,['hydrate']);
 hydration.resolve({id:'client-identity'});await Promise.resolve();
 assert.deepEqual(events,['hydrate','refresh']);
 refresh.resolve('synthetic-refresh-result-not-read-by-app');
 assert.equal(await pending,server);assert.deepEqual(events,['hydrate','refresh','server']);
});

test('an apparent client identity never overrides a logged-out server response',async()=>{
 const server={user:null,billingConfigured:false};
 const result=await loadVerifiedSession({getUser:async()=>({id:'untrusted-client-id'}),refreshSession:async()=>null},async()=>server);
 assert.equal(result,server);assert.equal(result.user,null);
});

test('server verified identity wins even when browser hydration has no user',async()=>{
 const server={user:{id:'server-only'},billingConfigured:false};
 assert.equal(await loadVerifiedSession({getUser:async()=>null,refreshSession:async()=>null},async()=>server),server);
});

test('hydration failure cannot expose client-only private state or start later steps',async()=>{
 const failure=new Error('Hydration unavailable');let refreshed=false,read=false;
 await assert.rejects(()=>loadVerifiedSession({getUser:async()=>{throw failure;},refreshSession:async()=>{refreshed=true;}},async()=>{read=true;}),error=>error===failure);
 assert.equal(refreshed,false);assert.equal(read,false);
});

test('refresh failure stops bootstrap rather than falling back to client identity',async()=>{
 const failure=new Error('Refresh unavailable');let read=false;
 await assert.rejects(()=>loadVerifiedSession({getUser:async()=>({id:'client'}),refreshSession:async()=>{throw failure;}},async()=>{read=true;}),error=>error===failure);
 assert.equal(read,false);
});

test('server session failure is surfaced instead of trusting a hydrated user',async()=>{
 const failure=new Error('Server session unavailable');
 await assert.rejects(()=>loadVerifiedSession({getUser:async()=>({id:'client'}),refreshSession:async()=>null},async()=>{throw failure;}),error=>error===failure);
});

test('Google initiation requests the Google provider and accepts its exact redirect sentinel',()=>{
 const calls=[];
 const result=beginGoogleLogin({oauthLogin(provider){calls.push(provider);throw new Error('Redirecting to OAuth provider');}});
 assert.deepEqual(calls,['google']);assert.deepEqual(result,{redirecting:true});
});

test('actual OAuth failures are not mistaken for a successful redirect',()=>{
 for(const message of ['Provider unavailable','Redirecting to OAuth provider failed','']){
  const failure=new Error(message);
  assert.throws(()=>beginGoogleLogin({oauthLogin(){throw failure;}}),error=>error===failure);
 }
});

test('provider cancellation gives a safe retry message and scrubs the whole mixed error/token hash',()=>{
 const calls=[];
 const message=consumeOAuthError({hash:'#error=access_denied&error_description=PRIVATE_PROVIDER_DETAIL&access_token=SYNTHETIC_TOKEN&refresh_token=SYNTHETIC_REFRESH',pathname:'/auth',search:'?mode=login'},{replaceState(...args){calls.push(args);}});
 assert.match(message,/canceled/i);assert.match(message,/try Google again/i);
 for(const privateDetail of ['PRIVATE_PROVIDER_DETAIL','SYNTHETIC_TOKEN','SYNTHETIC_REFRESH','access_token','refresh_token'])assert.equal(message.includes(privateDetail),false);
 assert.deepEqual(calls,[[null,'','/auth?mode=login']]);
});

test('unknown provider errors and description-only failures are generic and clear their fragments',()=>{
 for(const hash of ['#error=unexpected_code&error_description=PRIVATE_DETAIL','#error_description=PRIVATE_DETAIL']){
  let safeURL;
  const message=consumeOAuthError({hash,pathname:'/',search:''},{replaceState(_state,_title,url){safeURL=url;}});
  assert.match(message,/could not be completed/i);assert.equal(message.includes('PRIVATE_DETAIL'),false);assert.equal(message.includes('unexpected_code'),false);assert.equal(safeURL,'/');
 }
});

test('successful callback hashes remain available to the actual Identity SDK',()=>{
 let scrubbed=false;
 for(const hash of ['#access_token=SYNTHETIC_TOKEN&refresh_token=SYNTHETIC_REFRESH','#confirmation_token=SYNTHETIC_CONFIRMATION','#recovery_token=SYNTHETIC_RECOVERY']){
  assert.equal(consumeOAuthError({hash,pathname:'/',search:''},{replaceState(){scrubbed=true;}}),null);
 }
 assert.equal(scrubbed,false);
});

test('ordinary navigation anchors and empty hashes are not treated as OAuth failures',()=>{
 let scrubbed=false;
 for(const hash of ['','#how-it-works','#demo'])assert.equal(consumeOAuthError({hash,pathname:'/',search:''},{replaceState(){scrubbed=true;}}),null);
 assert.equal(scrubbed,false);
});
