import { createHmac, timingSafeEqual } from 'node:crypto';
import { fail } from './errors.mjs';

export const PRICE = 49900;
export const CURRENCY = 'INR';
export const APP = 'foldline';
export function validSignature(payload, signature, secret) {
 if (!secret || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return false;
 const expected = createHmac('sha256', secret).update(payload).digest();
 return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}
export function createRazorpay(env = process.env, fetcher = fetch) {
 const keyId = env.RAZORPAY_KEY_ID || '';
 const keySecret = env.RAZORPAY_KEY_SECRET || '';
 const webhookSecret = env.RAZORPAY_WEBHOOK_SECRET || '';
 // Test keys never activate a production paid plan.
 const configured = keyId.startsWith('rzp_live_') && !!keySecret && !!webhookSecret;
 const call = async (path, body) => {
  if (!configured) fail(503, 'Payments are unavailable during beta.');
  const response = await fetcher(`https://api.razorpay.com/v1/${path}`, {
   method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(15000),
   headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
   ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) fail(502, 'The payment provider could not complete this request.');
  return response.json();
 };
 return {
  configured, keyId,
  createOrder: (workspaceId, receipt) => call('orders', { amount: PRICE, currency: CURRENCY, receipt, notes: { app: APP, workspaceId } }),
  getOrder: id => call(`orders/${encodeURIComponent(id)}`),
  getPayment: id => call(`payments/${encodeURIComponent(id)}`),
  verifyCheckout: (orderId, paymentId, signature) => validSignature(`${orderId}|${paymentId}`, signature, keySecret),
  verifyWebhook: (raw, signature) => validSignature(raw, signature, webhookSecret),
 };
}

export function assertCaptured(payment, order, workspaceId) {
 if (payment.status !== 'captured' || payment.captured !== true || payment.order_id !== order.id ||
     payment.amount !== PRICE || payment.currency !== CURRENCY || (payment.amount_refunded || 0) > 0 ||
     order.amount !== PRICE || order.currency !== CURRENCY || order.notes?.app !== APP || order.notes?.workspaceId !== workspaceId) {
  fail(409, 'Payment is not a captured Foldline workspace pass.');
 }
}
