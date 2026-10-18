import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createRepository,RECORD_LIMITS} from '../../server/repository.mjs';

for(const plan of ['free','plus'])test(`${plan} bounds releases and history before writes; full workspaces remain readable and deletable`,async()=>{
 const db=new PGlite();
 try{
  await db.exec(await readFile(new URL('../../netlify/database/migrations/20261019010000_foldline.sql',import.meta.url),'utf8'));
  const repo=createRepository({pool:{connect:async()=>({query:async(sql,args=[])=>sql.startsWith('SELECT pg_advisory_xact_lock')?{rows:[]}:db.query(sql,args),release(){}})}});
  const board=await repo.create('owner','Product','product');
  const first=await repo.addRequest('owner',board.id,{title:'First request',problem:'Original evidence',workaround:''});
  const second=await repo.addRequest('owner',board.id,{title:'Second request',problem:'More evidence',workaround:''});
  if(plan==='plus'){
   await repo.saveOrder('owner',board.id,{id:'order_plus',amount:49900,currency:'INR'});
   await repo.applyPayment('order_plus','payment_plus',null,false,board.id);
  }
  const limits=RECORD_LIMITS[plan];
  await db.query("INSERT INTO foldline_decisions(id,workspace_id,request_id,decision,reason,status) SELECT 'history-'||i::text,$1,$2,'Past decision','Past reason','inbox' FROM generate_series(1,$3::int) i",[board.id,first.id,limits.decisions-1]);
  const count=async table=>(await db.query(`SELECT count(*)::int count FROM ${table} WHERE workspace_id=$1`,[board.id])).rows[0].count;
  // Two linked requests need two entries. Only one slot remains, so reject
  // the entire release before publishing or changing request statuses.
  await assert.rejects(()=>repo.release('owner',board.id,{title:'Cannot partially ship',body:'Notes',requestIds:[first.id,second.id]}),{status:403});
  assert.equal(await count('foldline_releases'),0);assert.equal(await count('foldline_decisions'),limits.decisions-1);
  assert.equal((await repo.get('owner',board.id)).requests.find(r=>r.id===first.id).status,'inbox');
  await repo.updateRequest('owner',board.id,first.id,{status:'planned',decision:'Final available entry'});
  assert.equal(await count('foldline_decisions'),limits.decisions);
  // No-op saves consume no storage even at the limit.
  await repo.updateRequest('owner',board.id,first.id,{status:'planned',decision:'Final available entry'});
  assert.equal(await count('foldline_decisions'),limits.decisions);
  await assert.rejects(()=>repo.updateRequest('owner',board.id,first.id,{decision:'Must not persist'}),{status:403});
  assert.equal((await repo.get('owner',board.id)).requests.find(r=>r.id===first.id).decision,'Final available entry');
  await assert.rejects(()=>repo.release('owner',board.id,{title:'No history capacity',body:'Notes',requestIds:[second.id]}),{status:403});
  assert.equal(await count('foldline_releases'),0);
  // A release without linked requests does not need a decision-history row.
  await repo.release('owner',board.id,{title:'Unlinked update',body:'Notes',requestIds:[]});
  await db.query("INSERT INTO foldline_releases(id,workspace_id,title) SELECT 'release-'||i::text,$1,'Release' FROM generate_series(1,$2::int) i",[board.id,limits.releases-1]);
  await assert.rejects(()=>repo.release('owner',board.id,{title:'Over release limit',body:'Must not persist',requestIds:[]}),{status:403});
  assert.equal(await count('foldline_releases'),limits.releases);assert.equal(await count('foldline_decisions'),limits.decisions);
  const data=await repo.get('owner',board.id);assert.equal(data.requests.length,2);assert.equal(data.releases.length,limits.releases);assert.equal(data.requests.find(r=>r.id===first.id).problem,'Original evidence');
  assert.equal((await repo.publicGet('product')).releases.length,limits.releases);
  const other=await repo.create('other-owner','Other','other-product');
  await repo.release('other-owner',other.id,{title:'Separate quota',body:'Independent',requestIds:[]});
  await repo.remove('owner',board.id);
  assert.equal(await count('foldline_decisions'),0);assert.equal(await count('foldline_releases'),0);
 }finally{await db.close();}
});
