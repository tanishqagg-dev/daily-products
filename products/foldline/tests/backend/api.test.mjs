import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createApi, boundedText } from '../../server/api.mjs';
import { createRazorpay, assertCaptured, validSignature } from '../../server/billing.mjs';
import { HttpError } from '../../server/errors.mjs';

const base='https://foldline.tanishq.work';
const req=(path,method='GET',data,headers={})=>new Request(base+path,{method,headers:{origin:base,'content-type':'application/json',...headers},...(data!==undefined?{body:JSON.stringify(data)}:{})});
const owner={id:'owner-a',email:'a@example.com'};
const order={id:'order_A',amount:49900,currency:'INR',notes:{app:'foldline',workspaceId:'w-a'}};
const payment={id:'pay_A',order_id:'order_A',amount:49900,currency:'INR',status:'captured',captured:true,amount_refunded:0};
const provider={configured:true,keyId:'rzp_live_public',getOrder:async()=>order,getPayment:async()=>payment,verifyCheckout:()=>true,verifyWebhook:()=>true,createOrder:async()=>order};
test('session exposes only verified user id/email and payment availability',async()=>{
 const api=createApi({repo:{},auth:async()=>({...owner,secret:'hide'}),billing:{configured:false}});
 assert.deepEqual(await (await api(req('/api/session'))).json(),{user:owner,billingConfigured:false});
});
test('private routes require authentication',async()=>{
 const api=createApi({repo:{},auth:async()=>null,billing:provider});
 assert.equal((await api(req('/api/workspaces'))).status,401);
});
test('mutations reject missing/cross origins before auth or repository runs',async()=>{
 let called=false;const api=createApi({repo:{},auth:async()=>{called=true;return owner;},billing:provider});
 for(const origin of ['', 'https://evil.example']) assert.equal((await api(req('/api/workspaces','POST',{name:'x'},{origin}))).status,403);
 assert.equal(called,false);
});
test('private operations receive authenticated identity instead of supplied owner',async()=>{
 let args;const api=createApi({repo:{create:async(...v)=>{args=v;return{id:'w'};}},auth:async()=>owner,billing:provider});
 const response=await api(req('/api/workspaces','POST',{name:'Board',slug:'board',ownerId:'victim'}));
 assert.equal(response.status,201);assert.deepEqual(args,['owner-a','Board','board']);
});
test('backend owner isolation failures remain 404 without data',async()=>{
 const api=createApi({repo:{get:async(id)=>{assert.equal(id,owner.id);throw new HttpError(404,'Workspace not found.');}},auth:async()=>owner,billing:provider});
 const response=await api(req('/api/workspaces/victim'));assert.equal(response.status,404);assert.deepEqual(await response.json(),{error:'Workspace not found.'});
});
test('checkout disabled without credentials and test credentials never grant paid access',async()=>{
 const billing=createRazorpay({RAZORPAY_KEY_ID:'rzp_test_x',RAZORPAY_KEY_SECRET:'x',RAZORPAY_WEBHOOK_SECRET:'x'});
 assert.equal(billing.configured,false);
 const api=createApi({repo:{},auth:async()=>owner,billing});assert.equal((await api(req('/api/checkout','POST',{workspaceId:'w-a'}))).status,503);
});
test('checkout uses server fixed order amount and verifies owner before provider',async()=>{
 const events=[];let args;const api=createApi({repo:{get:async()=>events.push('owner'),saveOrder:async()=>events.push('saved')},auth:async()=>owner,billing:{...provider,createOrder:async(...v)=>{events.push('provider');args=v;return order;}}});
 const response=await api(req('/api/checkout','POST',{workspaceId:'w-a',amount:1,currency:'USD',plan:'admin'}));
 assert.equal(response.status,200);assert.equal((await response.json()).amount,49900);assert.equal(args[0],'w-a');assert.deepEqual(events,['owner','provider','saved']);
});
test('HMAC verification rejects modified payloads and invalid signatures',()=>{
 const raw='raw-body';const sig=createHmac('sha256','secret').update(raw).digest('hex');
 assert.equal(validSignature(raw,sig,'secret'),true);assert.equal(validSignature(raw+' ',sig,'secret'),false);assert.equal(validSignature(raw,'x','secret'),false);
});
test('payment activation rejects wrong amount, currency, status, app and workspace',()=>{
 for(const changed of [{amount:1},{currency:'USD'},{captured:false},{status:'authorized'},{order_id:'wrong'},{amount_refunded:100}]) assert.throws(()=>assertCaptured({...payment,...changed},order,'w-a'));
 assert.throws(()=>assertCaptured(payment,{...order,notes:{...order.notes,app:'other'}},'w-a'));
 assert.throws(()=>assertCaptured(payment,order,'w-other'));
});
test('payment verify validates stored ownership and captured provider state before activating',async()=>{
 let active=false;const api=createApi({repo:{getOrder:async(...args)=>assert.deepEqual(args,[owner.id,'w-a','order_A']),applyPayment:async()=>{active=true;return{active:true};}},auth:async()=>owner,billing:{...provider,getPayment:async()=>({...payment,amount:100})}});
 assert.equal((await api(req('/api/billing/verify','POST',{workspaceId:'w-a',razorpay_order_id:'order_A',razorpay_payment_id:'pay_A',razorpay_signature:'sig'}))).status,409);assert.equal(active,false);
});
test('signed refund is processed without cookie auth/CSRF and revokes correct workspace',async()=>{
 let args;const api=createApi({repo:{applyPayment:async(...v)=>{args=v;return{active:false};}},auth:async()=>{throw Error('must not authenticate webhook');},billing:{...provider,getPayment:async()=>({...payment,amount_refunded:100})}});
 const response=await api(req('/api/billing/webhook','POST',{event:'refund.processed',payload:{refund:{entity:{payment_id:'pay_A'}}}},{origin:'','x-razorpay-signature':'signed','x-razorpay-event-id':'evt_a'}));
 assert.equal(response.status,200);assert.deepEqual(args,['order_A','pay_A','evt_a',true,'w-a']);
});
test('unsigned webhook cannot mutate state',async()=>{
 let called=false;const api=createApi({repo:{applyPayment:()=>{called=true;}},auth:async()=>owner,billing:{...provider,verifyWebhook:()=>false}});
 assert.equal((await api(req('/api/billing/webhook','POST',{event:'payment.captured'}))).status,400);assert.equal(called,false);
});
test('webhook HMAC uses exact bounded wire bytes before UTF-8 decoding',async()=>{
 const secret='short-unit-key';
 const canonical=Buffer.from('{"event":"unhandled.test","text":"\uFFFD"}','utf8');
 const index=canonical.indexOf(Buffer.from('\uFFFD'));
 const altered=Buffer.concat([canonical.subarray(0,index),Buffer.from([0xff]),canonical.subarray(index+3)]);
 assert.equal(canonical.toString('utf8'),altered.toString('utf8'));
 const signature=createHmac('sha256',secret).update(canonical).digest('hex');
 let seenRaw;
 const api=createApi({repo:{},auth:async()=>null,billing:{...provider,verifyWebhook:(raw,sig)=>{seenRaw=raw;return validSignature(raw,sig,secret);}}});
 const request=wire=>new Request(base+'/api/billing/webhook',{method:'POST',headers:{'content-type':'application/json','x-razorpay-signature':signature},body:wire});
 assert.equal((await api(request(canonical))).status,200);
 assert.equal(Buffer.isBuffer(seenRaw),true);assert.deepEqual(seenRaw,canonical);
 assert.equal((await api(request(altered))).status,400);
 assert.deepEqual(seenRaw,altered);
});
test('public submission response omits evidence and internal decisions',async()=>{
 const api=createApi({repo:{addRequest:async()=>({id:'r',title:'Please fix',status:'inbox',createdAt:'today',problem:'private context',reason:'internal'})},auth:async()=>null,billing:provider});
 const response=await api(req('/api/public/board/requests','POST',{title:'Please fix',problem:'private context'}));
 assert.deepEqual(await response.json(),{request:{id:'r',title:'Please fix',status:'inbox',createdAt:'today'}});
});
test('CSV exports are owner-scoped and spreadsheet formula safe',async()=>{
 const api=createApi({repo:{get:async(id)=>{assert.equal(id,owner.id);return{requests:[{id:'r',title:'=CMD()',problem:'line\n"quoted"',sourceIds:['a'],releaseIds:['b']}]};}},auth:async()=>owner,billing:provider});
 const response=await api(req('/api/workspaces/w-a/export'));const csv=await response.text();
 assert.equal(response.status,200);assert.ok(csv.includes("'=CMD()"));assert.ok(csv.includes('""quoted""'));assert.equal(response.headers.get('cache-control'),'no-store');
});
test('invalid status, duplicate release ids and invalid slug reject before persistence',async()=>{
 const api=createApi({repo:{},auth:async()=>owner,billing:provider});
 assert.equal((await api(req('/api/workspaces/w-a/requests/r','PATCH',{status:'merged'}))).status,400);
 assert.equal((await api(req('/api/workspaces/w-a/releases','POST',{title:'release',requestIds:['a','a']}))).status,400);
 assert.equal((await api(req('/api/workspaces','POST',{name:'board',slug:'Bad slug'}))).status,400);
});
test('body reader refuses oversized Content-Length and stops streaming at byte cap',async()=>{
 await assert.rejects(()=>boundedText(new Request(base,{method:'POST',headers:{'content-length':'24001'},body:'x'})),{status:413});
 let cancelled=false;
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(16));controller.enqueue(new Uint8Array(16));},cancel(){cancelled=true;}});
 await assert.rejects(()=>boundedText(new Request(base,{method:'POST',body:stream,duplex:'half'}),20),{status:413});
 assert.equal(cancelled,true);
 assert.equal(await boundedText(new Request(base,{method:'POST',body:'å'}),2),'å');
});
