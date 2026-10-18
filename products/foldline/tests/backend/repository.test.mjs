import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRepository} from '../../server/repository.mjs';

test('real PostgreSQL schema: owner isolation, quotas, evidence, releases, billing replay/refund and deletion',async()=>{
 const engine=new PGlite();
 try {
  await engine.exec(await readFile(new URL('../../netlify/database/migrations/20261019010000_foldline.sql',import.meta.url),'utf8'));
  // PGlite is single-session. It executes real SQL/transactions, while advisory
  // locks are a production pg.Pool concern and are not simulated as evidence here.
  const repo=createRepository({pool:{connect:async()=>({query:async(sql,args=[])=>sql.startsWith('SELECT pg_advisory_xact_lock')?{rows:[]}:engine.query(sql,args),release(){}})}});
  const w=await repo.create('owner-a','Product A','product-a');
  const other=await repo.create('owner-b','Product B','product-b');
  await assert.rejects(()=>repo.get('owner-b',w.id),{status:404});
  await assert.rejects(()=>repo.remove('owner-b',w.id),{status:404});
  await assert.rejects(()=>repo.create('owner-a','Second','second'),{status:403});
  const source=await repo.addRequest('owner-a',w.id,{title:'Original source',problem:'Original customer evidence',workaround:'Spreadsheet'});
  const target=await repo.addRequest('owner-a',w.id,{title:'Target',problem:'Target evidence',workaround:''});
  await assert.rejects(()=>repo.updateRequest('owner-b',w.id,source.id,{status:'planned'}),{status:404});
  await repo.updateRequest('owner-a',w.id,source.id,{status:'planned',decision:'Solve this',reason:'Blocks the weekly review'});
  const release=await repo.release('owner-a',w.id,{title:'Review fixes',body:'Released a simpler review.',requestIds:[source.id]});
  await repo.merge('owner-a',w.id,source.id,target.id);
  const data=await repo.get('owner-a',w.id);
  const preserved=data.requests.find(r=>r.id===source.id);
  assert.equal(preserved.problem,'Original customer evidence');assert.equal(preserved.reason,'Blocks the weekly review');assert.equal(preserved.status,'merged');
  assert.deepEqual(preserved.releaseIds,[release.id]);assert.deepEqual(data.requests.find(r=>r.id===target.id).sourceIds,[source.id]);assert.equal(data.decisions.length,2);
  const publicData=await repo.publicGet('product-a');
  assert.equal(publicData.requests.some(r=>r.id===source.id),false);
  assert.equal(JSON.stringify(publicData).includes('Original customer evidence'),false);
  assert.equal(JSON.stringify(publicData).includes('owner-a'),false);
  const foreign=await repo.addRequest('owner-b',other.id,{title:'Foreign',problem:'',workaround:''});
  await assert.rejects(()=>repo.merge('owner-a',w.id,target.id,foreign.id),{status:404});
  for(let i=0;i<28;i++) await repo.addRequest('owner-a',w.id,{title:`Request ${i}`,problem:'',workaround:''});
  await assert.rejects(()=>repo.addRequest('owner-a',w.id,{title:'Over limit',problem:'',workaround:''}),{status:403});
  await repo.saveOrder('owner-a',w.id,{id:'order_one',amount:49900,currency:'INR'});
  await assert.rejects(()=>repo.getOrder('owner-b',w.id,'order_one'),{status:404});
  await assert.rejects(()=>repo.applyPayment('order_one','pay_one','event_wrong',false,other.id),{status:409});
  assert.deepEqual(await repo.applyPayment('order_one','pay_one','event_one',false,w.id),{active:true});
  const first=(await engine.query('SELECT paid_until FROM foldline_orders WHERE id=$1',['order_one'])).rows[0].paid_until;
  assert.deepEqual(await repo.applyPayment('order_one','pay_one','event_one',false,w.id),{replayed:true});
  await repo.applyPayment('order_one','pay_one',null,false,w.id);
  assert.equal(String((await engine.query('SELECT paid_until FROM foldline_orders WHERE id=$1',['order_one'])).rows[0].paid_until),String(first));
  await repo.addRequest('owner-a',w.id,{title:'Now inside Plus quota',problem:'',workaround:''});
  const second=await repo.create('owner-a','Second','second');
  assert.equal(second.plan,'plus');
  assert.equal((await repo.get('owner-a',second.id)).workspace.plan,'plus');
  for(let i=3;i<=5;i++) await repo.create('owner-a',`Board ${i}`,`board-${i}`);
  await assert.rejects(()=>repo.create('owner-a','Sixth','sixth'),{status:403});
  await engine.query("INSERT INTO foldline_requests(id,workspace_id,title) SELECT 'quota-'||i::text,$1,'Quota request' FROM generate_series(1,469) i",[w.id]);
  await assert.rejects(()=>repo.addRequest('owner-a',w.id,{title:'Over Plus quota',problem:'',workaround:''}),{status:403});
  await repo.saveOrder('owner-a',second.id,{id:'order_two',amount:49900,currency:'INR'});
  await repo.applyPayment('order_two','pay_two','event_two',false,second.id);
  const secondExpiry=(await engine.query('SELECT paid_until FROM foldline_orders WHERE id=$1',['order_two'])).rows[0].paid_until;
  assert.ok(new Date(secondExpiry)-new Date(first)>=29.99*86400000);
  await repo.applyPayment('order_two','pay_two','refund_two',true,second.id);
  assert.equal((await repo.get('owner-a',w.id)).workspace.plan,'plus');
  await repo.applyPayment('order_one','pay_one','refund_one',true,w.id);
  assert.equal((await repo.get('owner-a',second.id)).workspace.plan,'free');
  assert.deepEqual(await repo.applyPayment('order_two','pay_two','late_capture',false,second.id),{active:false});
  // A refund can arrive first and permanently prevents a late capture grant.
  await repo.saveOrder('owner-a',w.id,{id:'order_three',amount:49900,currency:'INR'});
  await repo.applyPayment('order_three','pay_three','early_refund',true,w.id);
  assert.deepEqual(await repo.applyPayment('order_three','pay_three','later_capture',false,w.id),{active:false});
  await repo.remove('owner-a',w.id);
  assert.equal((await engine.query('SELECT count(*)::int count FROM foldline_requests WHERE workspace_id=$1',[w.id])).rows[0].count,0);
  assert.equal((await engine.query('SELECT count(*)::int count FROM foldline_orders WHERE owner_id=$1',['owner-a'])).rows[0].count,3);
  await assert.rejects(()=>repo.publicGet('product-a'),{status:404});
 }finally{await engine.close();}
});

test('public intake rate limit applies separately to each board and does not leak evidence',async()=>{
 const engine=new PGlite();
 try{
  await engine.exec(await readFile(new URL('../../netlify/database/migrations/20261019010000_foldline.sql',import.meta.url),'utf8'));
  const repo=createRepository({pool:{connect:async()=>({query:async(sql,args=[])=>sql.startsWith('SELECT pg_advisory_xact_lock')?{rows:[]}:engine.query(sql,args),release(){}})}});
  const w=await repo.create('owner','Product','product');
  for(let i=0;i<5;i++)await repo.addRequest(null,'product',{title:'Feedback',problem:'Private detail',workaround:''},'iphash');
  await assert.rejects(()=>repo.addRequest(null,'product',{title:'Sixth',problem:'',workaround:''},'iphash'),{status:429});
  const publicData=await repo.publicGet('product');assert.equal(publicData.requests.length,5);assert.equal(JSON.stringify(publicData).includes('Private detail'),false);
  assert.equal((await repo.get('owner',w.id)).requests.length,5);
 }finally{await engine.close();}
});
