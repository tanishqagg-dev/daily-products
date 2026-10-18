import { getSharedDatabase } from './database.mjs';
import { randomUUID } from 'node:crypto';
import { fail } from './errors.mjs';

const workspaceView = row => ({ id: row.id, name: row.name, slug: row.slug, plan: row.plus ? 'plus' : 'free' });
const requestView = row => ({ id: row.id, title: row.title, problem: row.problem, workaround: row.workaround,
 status: row.status, decision: row.decision, reason: row.reason, createdAt: new Date(row.created_at).toISOString(),
 sourceIds: row.source_ids || [], releaseIds: row.release_ids || [] });
const releaseView = row => ({ id: row.id, title: row.title, body: row.body, createdAt: new Date(row.created_at).toISOString(), requestIds: row.request_ids || [] });
export const RECORD_LIMITS={free:{releases:25,decisions:200,bytes:250000},plus:{releases:100,decisions:1000,bytes:1000000}};
const bytes=(...values)=>values.reduce((total,value)=>total+Buffer.byteLength(String(value??''),'utf8'),0);

export function createRepository(database) {
 const db = () => database || getSharedDatabase();
 async function transaction(operation) {
  const client = await db().pool.connect();
  const query = async (sql, args = []) => (await client.query(sql, args)).rows;
  try {
   await query('BEGIN');
   const result = await operation(query);
   await query('COMMIT'); return result;
  } catch (error) {
   await query('ROLLBACK');
   if (error.code === '23505') fail(409, 'That address is already in use.');
   throw error;
  } finally { client.release(); }
 }
 const workspace = async (q, id, owner, lock = false) => {
  const [row] = await q(`SELECT w.*, EXISTS(SELECT 1 FROM foldline_orders o WHERE o.owner_id=w.owner_id AND o.paid_until>now() AND NOT o.revoked) AS plus FROM foldline_workspaces w WHERE w.id=$1 ${owner ? 'AND w.owner_id=$2' : ''} ${lock ? 'FOR UPDATE OF w' : ''}`, owner ? [id, owner] : [id]);
  if (!row) fail(404, 'Workspace not found.'); return row;
 };
 const requests = (q, id, publicOnly = false) => q(`SELECT r.*, ARRAY(SELECT s.id FROM foldline_requests s WHERE s.merged_into=r.id ORDER BY s.created_at) source_ids, ARRAY(SELECT x.release_id FROM foldline_release_requests x WHERE x.request_id=r.id) release_ids FROM foldline_requests r WHERE workspace_id=$1 ${publicOnly ? "AND status <> 'merged' AND (status IN ('planned','shipped') OR public_submission)" : ''} ORDER BY created_at DESC`, [id]);
 const releases = (q, id) => q('SELECT r.*, ARRAY(SELECT x.request_id FROM foldline_release_requests x WHERE x.release_id=r.id) request_ids FROM foldline_releases r WHERE workspace_id=$1 ORDER BY created_at DESC', [id]);
 const decisionCapacity = async(q,row,additional=1)=>{
  if(!additional)return;
  const [count]=await q('SELECT count(*)::int count FROM foldline_decisions WHERE workspace_id=$1',[row.id]);
  if(count.count+additional>RECORD_LIMITS[row.plus?'plus':'free'].decisions) fail(403,'This workspace has reached its decision history limit. Existing records remain available for export and deletion.');
 };
 const payloadCapacity=async(q,row,additional)=>{
  const [usage]=await q(`SELECT
   COALESCE((SELECT sum(octet_length(id)+octet_length(workspace_id)+octet_length(title)+octet_length(problem)+octet_length(workaround)+octet_length(status)+octet_length(decision)+octet_length(reason)+octet_length(COALESCE(merged_into,''))) FROM foldline_requests WHERE workspace_id=$1),0)
   + COALESCE((SELECT sum(octet_length(id)+octet_length(workspace_id)+octet_length(request_id)+octet_length(decision)+octet_length(reason)+octet_length(status)) FROM foldline_decisions WHERE workspace_id=$1),0)
   + COALESCE((SELECT sum(octet_length(id)+octet_length(workspace_id)+octet_length(title)+octet_length(body)) FROM foldline_releases WHERE workspace_id=$1),0) AS bytes`,[row.id]);
  if(Number(usage.bytes)+additional>RECORD_LIMITS[row.plus?'plus':'free'].bytes) fail(403,'This workspace has reached its stored text limit. Existing records remain available for review, export and deletion.');
 };
 return {
  list: owner => transaction(async q => (await q('SELECT w.*, EXISTS(SELECT 1 FROM foldline_orders o WHERE o.owner_id=w.owner_id AND o.paid_until>now() AND NOT o.revoked) plus FROM foldline_workspaces w WHERE owner_id=$1 ORDER BY created_at', [owner])).map(workspaceView)),
  create: (owner, name, slug) => transaction(async q => {
   await q('SELECT pg_advisory_xact_lock(hashtext($1))', [owner]);
   const [limits] = await q('SELECT count(*)::int AS count, EXISTS(SELECT 1 FROM foldline_orders WHERE owner_id=$1 AND paid_until>now() AND NOT revoked) plus FROM foldline_workspaces WHERE owner_id=$1', [owner]);
   if (limits.count >= (limits.plus ? 5 : 1)) fail(403, 'Your workspace limit has been reached.');
   const [row] = await q('INSERT INTO foldline_workspaces(id,owner_id,name,slug) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(), owner, name, slug]);
   return workspaceView({...row,plus:limits.plus});
  }),
  get: (owner, id) => transaction(async q => {
   const row = await workspace(q, id, owner);
   return { workspace: workspaceView(row), requests: (await requests(q, id)).map(requestView), releases: (await releases(q, id)).map(releaseView),
    decisions: (await q('SELECT id,request_id AS "requestId",decision,reason,status,created_at AS "createdAt" FROM foldline_decisions WHERE workspace_id=$1 ORDER BY created_at DESC,id DESC LIMIT 50', [id])) };
  }),
  publicGet: slug => transaction(async q => {
   const [row] = await q('SELECT * FROM foldline_workspaces WHERE slug=$1', [slug]);
   if (!row) fail(404, 'Board not found.');
   return { workspace: {name: row.name, slug: row.slug}, requests: (await requests(q, row.id, true)).map(r => {
    const view = requestView(r); return { id: view.id, title: view.title, status: view.status, createdAt: view.createdAt };
   }), releases: (await releases(q, row.id)).map(r => { const view = releaseView(r); return { id: view.id, title: view.title, body: view.body, createdAt: view.createdAt }; }) };
  }),
  addRequest: (owner, idOrSlug, input, fingerprint) => transaction(async q => {
   let row;
   if (owner) row = await workspace(q, idOrSlug, owner, true);
   else {
    const [found] = await q('SELECT id FROM foldline_workspaces WHERE slug=$1', [idOrSlug]);
    if (!found) fail(404, 'Board not found.');
    row = await workspace(q, found.id, null, true);
    const [limit] = await q("INSERT INTO foldline_intake_limits(workspace_id,fingerprint,bucket,count) VALUES($1,$2,date_trunc('hour',now()),1) ON CONFLICT(workspace_id,fingerprint,bucket) DO UPDATE SET count=foldline_intake_limits.count+1 RETURNING count", [row.id, fingerprint]);
    if (limit.count > 5) fail(429, 'Please wait before sending more feedback.');
    await q("DELETE FROM foldline_intake_limits WHERE workspace_id=$1 AND bucket<now()-interval '2 hours'", [row.id]);
   }
   const [count] = await q('SELECT count(*)::int count FROM foldline_requests WHERE workspace_id=$1', [row.id]);
   if (count.count >= (row.plus ? 500 : 30)) fail(403, 'This workspace has reached its request limit.');
   const requestId=randomUUID();
   await payloadCapacity(q,row,bytes(requestId,row.id,input.title,input.problem,input.workaround,'inbox'));
   const [request] = await q('INSERT INTO foldline_requests(id,workspace_id,title,problem,workaround,public_submission) VALUES($1,$2,$3,$4,$5,$6) RETURNING *', [requestId, row.id, input.title, input.problem, input.workaround, !owner]);
   return requestView(request);
  }),
  updateRequest: (owner, id, rid, input) => transaction(async q => {
   const board=await workspace(q, id, owner, true);
   const [current] = await q('SELECT * FROM foldline_requests WHERE id=$1 AND workspace_id=$2', [rid, id]);
   if (!current) fail(404, 'Request not found.');
   if (current.status === 'merged') fail(409, 'Merged evidence is preserved. Edit the target request.');
   const status = input.status ?? current.status, decision = input.decision ?? current.decision, reason = input.reason ?? current.reason;
   if(status===current.status && decision===current.decision && reason===current.reason) return requestView(current);
   await decisionCapacity(q,board);
   await payloadCapacity(q,board,bytes(status,decision,reason)-bytes(current.status,current.decision,current.reason)+bytes(randomUUID(),id,rid,decision,reason,status));
   const [row] = await q('UPDATE foldline_requests SET status=$1,decision=$2,reason=$3 WHERE id=$4 RETURNING *', [status, decision, reason, rid]);
   await q('INSERT INTO foldline_decisions(id,workspace_id,request_id,decision,reason,status) VALUES($1,$2,$3,$4,$5,$6)', [randomUUID(), id, rid, decision, reason, status]);
   return requestView(row);
  }),
  merge: (owner, id, sourceId, targetId) => transaction(async q => {
   await workspace(q, id, owner, true);
   if (sourceId === targetId) fail(400, 'Choose two different requests.');
   const rows = await q('SELECT * FROM foldline_requests WHERE workspace_id=$1 AND id=ANY($2::text[]) FOR UPDATE', [id, [sourceId,targetId]]);
   if (rows.length !== 2) fail(404, 'Request not found.');
   if (rows.some(r => r.status === 'merged')) fail(409, 'A selected request is already merged.');
   // Preserve source text, decisions and release links. Flatten existing sources to the final target.
   await q('UPDATE foldline_requests SET merged_into=$1 WHERE workspace_id=$2 AND merged_into=$3', [targetId,id,sourceId]);
   await q("UPDATE foldline_requests SET status='merged',merged_into=$1 WHERE id=$2", [targetId,sourceId]);
   return requestView((await requests(q, id)).find(r => r.id === targetId));
  }),
  release: (owner, id, input) => transaction(async q => {
   const board=await workspace(q, id, owner, true);
   const rows = await q("SELECT id,status,decision,reason FROM foldline_requests WHERE workspace_id=$1 AND id=ANY($2::text[]) AND status<>'merged'", [id,input.requestIds]);
   if (rows.length !== input.requestIds.length) fail(400, 'Release contains an unknown or merged request.');
   const [count]=await q('SELECT count(*)::int count FROM foldline_releases WHERE workspace_id=$1',[id]);
   if(count.count>=RECORD_LIMITS[board.plus?'plus':'free'].releases) fail(403,'This workspace has reached its release limit. Existing records remain available for export and deletion.');
   await decisionCapacity(q,board,input.requestIds.length);
   await payloadCapacity(q,board,bytes(randomUUID(),id,input.title,input.body)+rows.reduce((total,r)=>total+bytes('shipped')-bytes(r.status)+bytes(randomUUID(),id,r.id,r.decision,r.reason,'shipped'),0));
   const [row] = await q('INSERT INTO foldline_releases(id,workspace_id,title,body) VALUES($1,$2,$3,$4) RETURNING *', [randomUUID(),id,input.title,input.body]);
   for (const rid of input.requestIds) {
    await q('INSERT INTO foldline_release_requests(release_id,request_id) VALUES($1,$2)', [row.id,rid]);
    await q("UPDATE foldline_requests SET status='shipped' WHERE id=$1", [rid]);
    await q("INSERT INTO foldline_decisions(id,workspace_id,request_id,decision,reason,status) SELECT $1,$2,id,decision,reason,'shipped' FROM foldline_requests WHERE id=$3", [randomUUID(),id,rid]);
   }
   return releaseView({...row,request_ids:input.requestIds});
  }),
  remove: (owner,id) => transaction(async q => { await workspace(q,id,owner,true); await q('DELETE FROM foldline_workspaces WHERE id=$1',[id]); }),
  saveOrder: (owner,id,order) => transaction(async q => {
   await workspace(q,id,owner,true);
   await q('INSERT INTO foldline_orders(id,workspace_id,owner_id,amount,currency) VALUES($1,$2,$3,$4,$5)',[order.id,id,owner,order.amount,order.currency]);
  }),
  getOrder: (owner,id,orderId) => transaction(async q => {
   await workspace(q,id,owner);
   const [order] = await q('SELECT * FROM foldline_orders WHERE id=$1 AND workspace_id=$2 AND owner_id=$3',[orderId,id,owner]);
   if (!order) fail(404,'Order not found.'); return order;
  }),
  applyPayment: (orderId,paymentId,eventId,revoke=false,workspaceId) => transaction(async q => {
   if(eventId) {
    const inserted=await q('INSERT INTO foldline_webhook_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[eventId]);
    if(!inserted.length) return {replayed:true};
   }
   const [order] = await q('SELECT * FROM foldline_orders WHERE id=$1 FOR UPDATE',[orderId]);
   if(!order) fail(404,'Order not found.');
   if(workspaceId && order.workspace_id!==workspaceId) fail(409,'Payment does not match workspace.');
   if(order.payment_id && order.payment_id!==paymentId) fail(409,'Payment does not match order.');
   if(revoke) {
    // Refunds may arrive before capture. Record revocation even in that ordering.
    await q('UPDATE foldline_orders SET revoked=true,payment_id=$2 WHERE id=$1',[orderId,paymentId]);
    return {active:false};
   }
   if(order.revoked) return {active:false};
   await q('SELECT pg_advisory_xact_lock(hashtext($1))',[order.owner_id]);
   await q("UPDATE foldline_orders SET payment_id=$2,paid_until=COALESCE(paid_until,GREATEST(now(),COALESCE((SELECT max(o.paid_until) FROM foldline_orders o WHERE o.owner_id=$3 AND NOT o.revoked),now()))+interval '30 days') WHERE id=$1",[orderId,paymentId,order.owner_id]);
   return {active:true};
  }),
 };
}
