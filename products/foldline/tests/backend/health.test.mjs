import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {schemaReady} from '../../server/health.mjs';

test('schema readiness distinguishes reachable empty, migrated and incomplete databases',async()=>{
 const engine=new PGlite();
 try{
  const database={sql:async(parts)=>(await engine.query(parts.join(''))).rows};
  assert.equal((await engine.query('SELECT 1 AS reachable')).rows[0].reachable,1);
  assert.equal(await schemaReady(database),false);
  await engine.exec(await readFile(new URL('../../netlify/database/migrations/20261019010000_foldline.sql',import.meta.url),'utf8'));
  assert.equal(await schemaReady(database),true);
  // Destructive DDL is confined to this disposable in-memory test engine.
  await engine.exec('DROP TABLE foldline_webhook_events');
  assert.equal(await schemaReady(database),false);
 }finally{await engine.close();}
});
