// Inject this function into the T3 collaborative browser after a real Google
// login. It never reads cookies, local auth storage, passwords or OAuth tokens.
export default async function hostedWorkflow(options={}){
 const results=[];
 const check=(condition,name)=>{if(!condition)throw new Error(name);results.push({check:name,passed:true});};
 const origin=location.origin;
 const preview=/^[a-z0-9-]+--foldline-tanishq\.netlify\.app$/.test(location.hostname);
 const phase=options.phase||'preflight';
 const mutating=['owner-workflow','second-owner','cleanup'].includes(phase);
 const fixtureKey='foldline-e2e-fixture-v1';
 let fixture=options.fixture||JSON.parse(sessionStorage.getItem(fixtureKey)||'null');
 const save=()=>sessionStorage.setItem(fixtureKey,JSON.stringify(fixture));
 const call=async(path,{method='GET',data,anonymous=false,text=false}={})=>{
  const response=await fetch(path,{method,credentials:anonymous?'omit':'same-origin',cache:'no-store',headers:data===undefined?{}:{'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});
  return{status:response.status,data:text?await response.text():await response.json(),headers:response.headers};
 };
 try{
  check(location.protocol==='https:','Hosted HTTPS origin');
  check(preview,'Preview host only; production remains untouched');
  if(mutating){check(options.allowMutations===true,'Explicit mutation authorization');check(options.confirmOrigin===origin,'Exact authorized preview origin');}
  const health=await call('/.netlify/functions/health');check(health.status===200&&health.data.status==='ok','Database and required schema ready');
  const settings=await call('/.netlify/identity/settings');check(settings.status===200&&settings.data.external?.google===true,'Google enabled by actual Identity settings');
  check(!location.hash.includes('_token=')&&!location.hash.includes('access_token='),'Provider callback tokens cleared from URL');
  const session=await call('/api/session');check(session.status===200,'Session endpoint reachable');
  if(phase==='preflight')return{status:'passed',phase,origin,authenticated:!!session.data.user,results};
  if(phase==='logged-out'){
   check(session.data.user===null,'Logout cleared server-visible session');
   check((await call('/api/workspaces')).status===401,'Logged-out private API denied');
   return{status:'passed',phase,origin,results};
  }
  check(!!session.data.user?.id,'Real provider session verified by server');
  const userId=session.data.user.id;
  if(phase==='owner-workflow'){
   if(!fixture){
    const existing=await call('/api/workspaces');check(existing.status===200,'Authenticated workspace list works');
    check(existing.data.workspaces.length===0,'Clean approved test account; existing workspaces left intact');
    const runId=(options.runId||Date.now().toString(36)).replace(/[^a-z0-9]/g,'').slice(0,18);
    fixture={runId,ownerId:userId,origin,slug:`e2e-${runId}`,name:`E2E review ${runId}`,steps:{}};save();
   }
   check(fixture.ownerId===userId&&fixture.origin===origin,'Fixture belongs to current verified owner and origin');
   if(!fixture.workspaceId){
    const created=await call('/api/workspaces',{method:'POST',data:{name:fixture.name,slug:fixture.slug}});
    check(created.status===201&&created.data.workspace?.id,'Workspace persisted');fixture.workspaceId=created.data.workspace.id;save();
   }
   const base=`/api/workspaces/${encodeURIComponent(fixture.workspaceId)}`;
   if(!fixture.sourceId){
    const intake=await call(`/api/public/${fixture.slug}/requests`,{method:'POST',anonymous:true,data:{title:`Public source ${fixture.runId}`,problem:`PRIVATE_EVIDENCE_${fixture.runId}`,workaround:`PRIVATE_WORKAROUND_${fixture.runId}`}});
    check(intake.status===201&&intake.data.request?.id,'Anonymous public intake persisted');fixture.sourceId=intake.data.request.id;save();
   }
   if(!fixture.targetId){
    const target=await call(`${base}/requests`,{method:'POST',data:{title:`Related target ${fixture.runId}`,problem:'Keep source context when reviewing related feedback.',workaround:'Manual copy and paste.'}});
    check(target.status===201,'Owner feedback persisted');fixture.targetId=target.data.request.id;save();
   }
   if(!fixture.steps.decision){
    const decision=await call(`${base}/requests/${fixture.sourceId}`,{method:'PATCH',data:{status:'planned',decision:'Ship a smaller review workflow',reason:`PRIVATE_REASON_${fixture.runId}`}});
    check(decision.status===200&&decision.data.request.status==='planned','Owner decision and reason persisted');fixture.steps.decision=true;save();
   }
   if(!fixture.steps.merge){
    const merged=await call(`${base}/merge`,{method:'POST',data:{sourceId:fixture.sourceId,targetId:fixture.targetId}});
    check(merged.status===200&&merged.data.request.sourceIds.includes(fixture.sourceId),'Manual merge preserves source association');fixture.steps.merge=true;save();
   }
   if(!fixture.releaseId){
    const released=await call(`${base}/releases`,{method:'POST',data:{title:`Release ${fixture.runId}`,body:'The review workflow is ready for customers.',requestIds:[fixture.targetId]}});
    check(released.status===201&&released.data.release?.id,'Release and request link persisted');fixture.releaseId=released.data.release.id;save();
   }
   const review=await call(base);check(review.status===200,'Fresh authenticated read after writes');
   const source=review.data.requests.find(r=>r.id===fixture.sourceId),target=review.data.requests.find(r=>r.id===fixture.targetId);
   check(source?.problem===`PRIVATE_EVIDENCE_${fixture.runId}`&&source?.reason===`PRIVATE_REASON_${fixture.runId}`&&source?.status==='merged','Merged source retains original private evidence and reason');
   check(target?.status==='shipped'&&target.releaseIds.includes(fixture.releaseId),'Released target is shipped and linked');
   const board=await call(`/api/public/${fixture.slug}`,{anonymous:true});check(board.status===200,'Anonymous public board readable');
   const publicJson=JSON.stringify(board.data);
   check(!publicJson.includes(`PRIVATE_EVIDENCE_${fixture.runId}`)&&!publicJson.includes(`PRIVATE_REASON_${fixture.runId}`)&&!publicJson.includes(`PRIVATE_WORKAROUND_${fixture.runId}`),'Public board excludes private evidence and decisions');
   check(board.data.requests.some(r=>r.id===fixture.targetId)&&!board.data.requests.some(r=>r.id===fixture.sourceId),'Public roadmap shows shipped target and hides merged source');
   check(board.data.releases.some(r=>r.id===fixture.releaseId),'Published release visible anonymously');
   const csv=await call(`${base}/export`,{text:true});check(csv.status===200&&csv.headers.get('content-type')?.includes('text/csv')&&csv.data.includes(`PRIVATE_EVIDENCE_${fixture.runId}`)&&csv.data.includes(fixture.releaseId),'Owner CSV contains preserved evidence and release association');
   const anonymousPrivate=await call(base,{anonymous:true});check(anonymousPrivate.status===401,'Anonymous private workspace denied');
   if(session.data.billingConfigured===false)check((await call('/api/checkout',{method:'POST',data:{workspaceId:fixture.workspaceId}})).status===503,'Unavailable payments stay disabled; no charge attempted');
   return{status:'passed',phase,origin,fixture,results,next:'Inspect owner/public UI at desktop and mobile, then log out and sign in as a different real Google account for second-owner phase.'};
  }
  check(!!fixture?.workspaceId&&fixture.origin===origin,'Approved owner fixture present');
  const base=`/api/workspaces/${encodeURIComponent(fixture.workspaceId)}`;
  if(phase==='second-owner'){
   check(userId!==fixture.ownerId,'Second legitimate provider account is distinct');
   const list=await call('/api/workspaces');check(list.status===200&&!list.data.workspaces.some(w=>w.id===fixture.workspaceId),'Second owner list excludes first workspace');
   for(const path of [base,`${base}/export`])check((await call(path,{text:path.endsWith('/export')})).status===404,`Other-owner read denied: ${path.endsWith('/export')?'export':'workspace'}`);
   check((await call(`${base}/requests/${fixture.targetId}`,{method:'PATCH',data:{reason:'must never persist'}})).status===404,'Other-owner decision edit denied');
   check((await call(`${base}/merge`,{method:'POST',data:{sourceId:fixture.sourceId,targetId:fixture.targetId}})).status===404,'Other-owner merge denied');
   check((await call(`${base}/releases`,{method:'POST',data:{title:'must never publish',body:'Unauthorized probe',requestIds:[]}})).status===404,'Other-owner release denied');
   check((await call(base,{method:'DELETE'})).status===404,'Other-owner deletion denied');
   return{status:'passed',phase,origin,fixture,results,next:'Log out normally, verify logged-out phase, then restore owner session for optional fixture cleanup.'};
  }
  if(phase==='cleanup'){
   check(userId===fixture.ownerId,'Only original owner can clean up approved fixture');
   const current=await call(base);check(current.status===200&&current.data.workspace.slug===fixture.slug,'Exact synthetic fixture verified before deletion');
   check(fixture.slug.startsWith('e2e-'),'Synthetic E2E namespace');
   check((await call(base,{method:'DELETE'})).status===200,'Approved synthetic workspace deleted');
   check((await call(`/api/public/${fixture.slug}`,{anonymous:true})).status===404,'Deleted synthetic board no longer public');
   sessionStorage.removeItem(fixtureKey);return{status:'passed',phase,origin,results};
  }
  throw new Error('Unknown test phase');
 }catch(error){return{status:'failed',phase,origin,error:String(error?.message||'Hosted check failed'),fixture,results};}
}
