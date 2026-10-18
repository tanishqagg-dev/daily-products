import { getSharedDatabase } from '../../server/database.mjs';
import { createRazorpay } from '../../server/billing.mjs';
import {schemaReady} from '../../server/health.mjs';

export default async () => {
 const billing=createRazorpay();
 const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 try{
  if(!await schemaReady(getSharedDatabase())){const error=new Error();error.name='MissingDatabaseSchemaError';error.code='SCHEMA_MISSING';throw error;}
  return Response.json({status:'ok',app:'foldline',beta:!billing.configured,billing_enabled:billing.configured},{headers});
 }catch(error){
  console.error('foldline_health_database_error',error?.name || 'Error',typeof error?.code==='string'?error.code:'unknown');
  return Response.json({status:'unavailable',app:'foldline',beta:!billing.configured,billing_enabled:billing.configured},{status:503,headers});
 }
};
