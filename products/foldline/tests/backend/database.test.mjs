import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabaseCache} from '../../server/database.mjs';

test('database cache reuses one pool and drains previous pool after credential rotation',async()=>{
 let credentials='first',creations=0,retirements=0;
 const get=createDatabaseCache(()=>credentials,key=>{creations++;return{key,pool:{end:async()=>{retirements++;}}};});
 const first=get();assert.equal(get(),first);assert.equal(creations,1);
 credentials='second';const second=get();assert.notEqual(first,second);assert.equal(second.key,'second');assert.equal(creations,2);
 await Promise.resolve();assert.equal(retirements,1);assert.equal(get(),second);
});

test('failed connection replacement keeps current cache available for a retry',()=>{
 let credentials='first',fail=false,created=0;
 const get=createDatabaseCache(()=>credentials,key=>{created++;if(fail)throw Error('configuration unavailable');return{key,pool:{end:async()=>{}}};});
 const first=get();credentials='second';fail=true;assert.throws(get);credentials='first';
 assert.equal(get(),first);assert.equal(created,2);
});
