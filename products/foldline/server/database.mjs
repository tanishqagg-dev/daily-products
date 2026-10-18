import {getDatabase,getConnectionString} from '@netlify/database';

// Modern Netlify runtimes can rotate branch credentials between invocations.
// Reuse a pool while its credentials match; pg.Pool.end() drains old clients.
export function createDatabaseCache(readConnectionString,createConnection) {
 let current,connectionString;
 return () => {
  const next=readConnectionString();
  if(!current || next!==connectionString) {
   const previous=current;
   current=createConnection(next);
   connectionString=next;
   current.pool?.on?.('error',error=>console.error('foldline_database_pool_error',error?.name || 'Error',typeof error?.code==='string'?error.code:'unknown'));
   if(previous) Promise.resolve(previous.pool.end()).catch(error=>console.error('foldline_database_pool_retirement_error',error?.name || 'Error',typeof error?.code==='string'?error.code:'unknown'));
  }
  return current;
 };
}

export const getSharedDatabase=createDatabaseCache(getConnectionString,connectionString=>getDatabase({connectionString}));
