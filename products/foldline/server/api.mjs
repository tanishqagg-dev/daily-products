import { createHash, randomUUID } from 'node:crypto';
import { HttpError, fail } from './errors.mjs';
import { APP, PRICE, CURRENCY, assertCaptured } from './billing.mjs';

const json = (value, status=200) => Response.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const text = (value,name,max,required=false) => {
 if(value === undefined && !required) return '';
 if(typeof value !== 'string' || value.length>max || (required && !value.trim())) fail(400,`Check ${name}.`);
 return value.trim();
};
export async function boundedText(req,max=24000) {
 const declared=req.headers.get('content-length');
 if(declared!==null && (!/^\d+$/.test(declared) || Number(declared)>max)) fail(413,'Request is too large.');
 if(!req.body) return '';
 const reader=req.body.getReader(), chunks=[];
 let size=0;
 try{
  while(true){
   const {value,done}=await reader.read();if(done)break;
   size+=value.byteLength;
   if(size>max){await reader.cancel();fail(413,'Request is too large.');}
   chunks.push(value);
  }
 }finally{reader.releaseLock();}
 return Buffer.concat(chunks,size).toString('utf8');
}
async function body(req) {
 if(!(req.headers.get('content-type')||'').includes('application/json')) fail(415,'Send JSON.');
 const raw=await boundedText(req);
 try { const value=JSON.parse(raw); if(!value || Array.isArray(value) || typeof value!=='object') fail(400,'Invalid JSON object.'); return value; }
 catch(error) { if(error instanceof HttpError) throw error; fail(400,'Invalid JSON.'); }
}
const intake = value => ({title:text(value.title,'title',160,true),problem:text(value.problem,'problem',4000),workaround:text(value.workaround,'workaround',2000)});
export function checkOrigin(req) {
 const origin=req.headers.get('origin');
 if(!origin || origin!==new URL(req.url).origin || req.headers.get('sec-fetch-site')==='cross-site') fail(403,'Request origin is not allowed.');
}
const csvCell = value => {
 let cell=String(value ?? '');
 if(/^[\s]*[=+@-]/.test(cell)) cell=`'${cell}`;
 return `"${cell.replaceAll('"','""')}"`;
};

export function createApi({repo,auth,billing,originCheck=checkOrigin}) {
 return async function handle(req,context={}) {
  try {
   const path=new URL(req.url).pathname.replace(/\/$/,'');
   const method=req.method;
   if(path==='/api/billing/webhook' && method==='POST') {
    if(!billing.configured) fail(503,'Payments are unavailable during beta.');
    const raw=await boundedText(req,100000);
    if(!billing.verifyWebhook(raw,req.headers.get('x-razorpay-signature'))) fail(400,'Invalid webhook signature.');
    let event; try{event=JSON.parse(raw);}catch{fail(400,'Invalid JSON.');}
    const eventId=req.headers.get('x-razorpay-event-id') || createHash('sha256').update(raw).digest('hex');
    if(!['payment.captured','refund.processed','payment.refunded'].includes(event.event)) return json({received:true,ignored:true});
    const entity=event.payload?.payment?.entity;
    const refund=event.payload?.refund?.entity;
    const paymentId=entity?.id || refund?.payment_id;
    if(!paymentId) fail(400,'Missing payment.');
    const payment=await billing.getPayment(paymentId);
    if(!payment.order_id) return json({received:true,ignored:true});
    const order=await billing.getOrder(payment.order_id);
    if(order.notes?.app!==APP) return json({received:true,ignored:true});
    const workspaceId=order.notes?.workspaceId;
    const revoke=event.event!=='payment.captured';
    if(revoke) {
     if(payment.amount!==PRICE || payment.currency!==CURRENCY || order.amount!==PRICE || order.currency!==CURRENCY || !(payment.amount_refunded>0)) fail(409,'Refund does not match a Foldline pass.');
    } else assertCaptured(payment,order,workspaceId);
    const result=await repo.applyPayment(order.id,payment.id,eventId,revoke,workspaceId);
    return json({received:true,...result});
   }
   if(!['GET','HEAD'].includes(method)) originCheck(req);
   const user=await auth(req);
   if(path==='/api/session' && method==='GET') return json({user:user ? {id:user.id,email:user.email} : null,billingConfigured:billing.configured});
   const publicMatch=path.match(/^\/api\/public\/([a-z0-9-]{3,48})(\/requests)?$/);
   if(publicMatch) {
    if(method==='GET' && !publicMatch[2]) return json(await repo.publicGet(publicMatch[1]));
    if(method==='POST' && publicMatch[2]) {
     const fingerprint=createHash('sha256').update(context.ip || 'unknown').digest('hex');
     const request=await repo.addRequest(null,publicMatch[1],intake(await body(req)),fingerprint);
     // A submission response must not leak private evidence merged into other requests.
     return json({request:{id:request.id,title:request.title,status:request.status,createdAt:request.createdAt}},201);
    }
    fail(405,'Method not allowed.');
   }
   if(!user?.id) fail(401,'Sign in to continue.');
   if(path==='/api/workspaces') {
    if(method==='GET') return json({workspaces:await repo.list(user.id)});
    if(method==='POST') {
     const input=await body(req), name=text(input.name,'workspace name',80,true),slug=text(input.slug,'board address',48,true);
     if(!/^[a-z0-9][a-z0-9-]{1,46}[a-z0-9]$/.test(slug)) fail(400,'Use 3–48 lowercase letters, numbers or hyphens for the board address.');
     return json({workspace:await repo.create(user.id,name,slug)},201);
    }
   }
   if(path==='/api/checkout' && method==='POST') {
    if(!billing.configured) fail(503,'Payments are unavailable during beta.');
    const input=await body(req), workspaceId=text(input.workspaceId,'workspace',100,true);
    await repo.get(user.id,workspaceId);
    const order=await billing.createOrder(workspaceId,randomUUID());
    if(order.amount!==PRICE || order.currency!==CURRENCY || !order.id) fail(502,'Unexpected payment order.');
    await repo.saveOrder(user.id,workspaceId,order);
    return json({id:order.id,amount:PRICE,currency:CURRENCY,keyId:billing.keyId,name:'Foldline',description:'30-day workspace pass. No automatic renewal.'});
   }
   if(path==='/api/billing/verify' && method==='POST') {
    if(!billing.configured) fail(503,'Payments are unavailable during beta.');
    const input=await body(req),workspaceId=text(input.workspaceId,'workspace',100,true),orderId=text(input.razorpay_order_id,'order',100,true),paymentId=text(input.razorpay_payment_id,'payment',100,true);
    await repo.getOrder(user.id,workspaceId,orderId);
    if(!billing.verifyCheckout(orderId,paymentId,input.razorpay_signature)) fail(400,'Invalid payment signature.');
    const [payment,order]=await Promise.all([billing.getPayment(paymentId),billing.getOrder(orderId)]);
    assertCaptured(payment,order,workspaceId);
    return json(await repo.applyPayment(orderId,paymentId,null,false,workspaceId));
   }
   const match=path.match(/^\/api\/workspaces\/([^/]+)(?:\/(requests|merge|releases|export)(?:\/([^/]+))?)?$/);
   if(!match) fail(404,'Endpoint not found.');
   const [,id,action,rid]=match;
   if(!action) {
    if(method==='GET') return json(await repo.get(user.id,id));
    if(method==='DELETE') {await repo.remove(user.id,id); return json({deleted:true});}
   }
   if(action==='requests' && method==='POST' && !rid) return json({request:await repo.addRequest(user.id,id,intake(await body(req)))},201);
   if(action==='requests' && method==='PATCH' && rid) {
    const input=await body(req),patch={};
    if(input.status!==undefined) {if(!['inbox','planned','declined','shipped'].includes(input.status)) fail(400,'Invalid request status.');patch.status=input.status;}
    if(input.decision!==undefined) patch.decision=text(input.decision,'decision',2000);
    if(input.reason!==undefined) patch.reason=text(input.reason,'reason',4000);
    if(!Object.keys(patch).length) fail(400,'No changes supplied.');
    return json({request:await repo.updateRequest(user.id,id,rid,patch)});
   }
   if(action==='merge' && method==='POST' && !rid) {
    const input=await body(req);return json({request:await repo.merge(user.id,id,text(input.sourceId,'source',100,true),text(input.targetId,'target',100,true))});
   }
   if(action==='releases' && method==='POST' && !rid) {
    const input=await body(req);
    if(!Array.isArray(input.requestIds) || input.requestIds.length>500 || input.requestIds.some(v=>typeof v!=='string'||v.length>100) || new Set(input.requestIds).size!==input.requestIds.length) fail(400,'Choose valid requests for this release.');
    return json({release:await repo.release(user.id,id,{title:text(input.title,'release title',160,true),body:text(input.body,'release notes',8000),requestIds:input.requestIds})},201);
   }
   if(action==='export' && method==='GET' && !rid) {
    const data=await repo.get(user.id,id);
    const columns=['id','title','problem','workaround','status','decision','reason','createdAt','sourceIds','releaseIds'];
    const csv=[columns.map(csvCell).join(','),...data.requests.map(r=>columns.map(key=>csvCell(Array.isArray(r[key])?r[key].join(';'):r[key])).join(','))].join('\r\n');
    return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="foldline-export.csv"','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
   }
   fail(405,'Method not allowed.');
  }catch(error) {
   if(error instanceof HttpError) return json({error:error.message},error.status);
   // Avoid credentials, query text, feedback or provider payloads in logs/responses.
   console.error('foldline_api_error',error?.name || 'Error');
   return json({error:'The workspace service is temporarily unavailable. Please try again.'},503);
  }
 };
}
