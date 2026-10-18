import { getUser, verifyRequestOrigin } from '@netlify/identity';
import { createApi, checkOrigin } from '../../server/api.mjs';
import { createRepository } from '../../server/repository.mjs';
import { createRazorpay } from '../../server/billing.mjs';

export default async (request,context) => createApi({
 repo:createRepository(), auth:()=>getUser(), billing:createRazorpay(),
 originCheck:req=>{checkOrigin(req);verifyRequestOrigin(req);},
})(request,context);

export const config={path:'/api/*'};
