import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRepository,RECORD_LIMITS} from '../../server/repository.mjs';

for(const plan of ['free','plus'])test(`${plan} UTF-8 payload budget rejects intake, decision and release growth atomically`,async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../../netlify/database/migrations/20261019010000_foldline.sql',import.meta.url),'utf8'));
  const repo=createRepository({pool:{connect:async()=>({query:async(sql,args=[])=>sql.startsWith('SELECT pg_advisory_xact_lock')?{rows:[]}:db.query(sql,args),release(){}})}});
  const w=await repo.create('owner','Product','product');
  const request=await repo.addRequest('owner',w.id,{title:'Request',problem:'Evidence',workaround:''});
  if(plan==='plus'){
   await repo.saveOrder('owner',w.id,{id:'order_budget',amount:49900,currency:'INR'});
   await repo.applyPayment('order_budget','payment_budget',null,false,w.id);
  }
  // Fill with multibyte UTF-8 text. Character count is below the byte budget.
  const remaining=RECORD_LIMITS[plan].bytes-500;
  await db.query("INSERT INTO foldline_releases(id,workspace_id,title,body) VALUES('fill',$1,'Fixture',repeat('界',$2::int))",[w.id,Math.floor(remaining/3)]);
  await assert.rejects(()=>repo.addRequest('owner',w.id,{title:'Growth',problem:'界'.repeat(200),workaround:''}),{status:403});
  await assert.rejects(()=>repo.addRequest(null,'product',{title:'Public growth',problem:'界'.repeat(200),workaround:''},'fingerprint'),{status:403});
  await assert.rejects(()=>repo.updateRequest('owner',w.id,request.id,{decision:'界'.repeat(200),status:'planned'}),{status:403});
  await assert.rejects(()=>repo.release('owner',w.id,{title:'Blocked release',body:'界'.repeat(200),requestIds:[request.id]}),{status:403});
  const data=await repo.get('owner',w.id);
  assert.equal(data.requests.length,1);assert.equal(data.requests[0].status,'inbox');assert.equal(data.requests[0].decision,'');
  assert.equal(data.releases.length,1);assert.equal(data.decisions.length,0);
  assert.equal((await db.query('SELECT count(*)::int count FROM foldline_release_requests')).rows[0].count,0);
  assert.equal((await db.query('SELECT count(*)::int count FROM foldline_intake_limits')).rows[0].count,0);
  await repo.remove('owner',w.id);assert.equal((await db.query('SELECT count(*)::int count FROM foldline_releases')).rows[0].count,0);
 }finally{await db.close();}
});
