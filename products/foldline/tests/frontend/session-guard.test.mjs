// Local async-state regression only. No browser/provider session is fabricated.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSessionGuard} from '../../src/session.js';

function deferred(){let resolve;const promise=new Promise(done=>{resolve=done;});return{promise,resolve};}

test('a delayed private response cannot commit after logout/pagehide invalidates its session',async()=>{
 for(const event of ['logout','pagehide','unmount']){
  const guard=createSessionGuard(),response=deferred(),token=guard.capture();let privateState=null;
  const pending=(async()=>{const data=await response.promise;if(guard.isCurrent(token))privateState=data;})();
  guard.invalidate();response.resolve({privateEvidence:`must not render after ${event}`});await pending;
  assert.equal(privateState,null);assert.equal(guard.isCurrent(token),false);
 }
});

test('new boot invalidates older session reads even when the older response arrives last',async()=>{
 const guard=createSessionGuard(),oldResponse=deferred(),newResponse=deferred();let state=null;
 const oldToken=guard.capture();
 const oldWork=(async()=>{const value=await oldResponse.promise;if(guard.isCurrent(oldToken))state=value;})();
 guard.invalidate();const newToken=guard.capture();
 const newWork=(async()=>{const value=await newResponse.promise;if(guard.isCurrent(newToken))state=value;})();
 newResponse.resolve({owner:'current synthetic owner'});await newWork;
 oldResponse.resolve({owner:'previous synthetic owner'});await oldWork;
 assert.deepEqual(state,{owner:'current synthetic owner'});assert.equal(guard.isCurrent(newToken),true);
});

test('multiple clears never make an earlier generation valid again',()=>{
 const guard=createSessionGuard(),first=guard.capture();
 for(let index=0;index<100;index++){guard.invalidate();assert.equal(guard.isCurrent(first),false);}
 const current=guard.capture();assert.equal(guard.isCurrent(current),true);
});

test('current-generation work can commit normally while independent guards remain isolated',async()=>{
 const a=createSessionGuard(),b=createSessionGuard(),response=deferred(),token=a.capture();let state=null;
 const pending=(async()=>{const value=await response.promise;if(a.isCurrent(token))state=value;})();
 b.invalidate();response.resolve({evidence:'current response'});await pending;
 assert.deepEqual(state,{evidence:'current response'});
});
