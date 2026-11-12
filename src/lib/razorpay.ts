import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Razorpay: orders, payment checks and webhook signatures.
// Docs: https://razorpay.com/docs/payments/server-integration/nodejs/payment-gateway/build-integration/
// Keys come from the environment; test keys (rzp_test_…) work the same as live ones.

export const ORDER_ID_PATTERN = /^order_[A-Za-z0-9]{6,40}$/;
export const PAYMENT_ID_PATTERN = /^pay_[A-Za-z0-9]{6,40}$/;
/** Months a studio can pay for at once. */
export const PAY_MONTHS = [1, 3, 6, 12] as const;

export type RazorpayConfig = { keyId: string; keySecret: string; webhookSecret: string | null; apiBase: string };

/** The Razorpay keys, or null when online payment isn't set up yet. */
export function razorpayConfig(): RazorpayConfig | null {
  const keyId = process.env.RAZORPAY_KEY_ID?.trim();
  const keySecret = process.env.RAZORPAY_KEY_SECRET?.trim();
  if (!keyId || !keySecret || !/^rzp_(test|live)_[A-Za-z0-9]+$/.test(keyId)) return null;
  let apiBase = process.env.RAZORPAY_API_BASE?.trim() || "https://api.razorpay.com";
  while (apiBase.endsWith("/")) apiBase = apiBase.slice(0, -1);
  return { keyId, keySecret, webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET?.trim() || null, apiBase };
}

export function isTestMode(config: RazorpayConfig): boolean {
  return config.keyId.startsWith("rzp_test_");
}

function hmacHex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

function sameHex(a: string, b: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(a) || !/^[0-9a-f]{64}$/.test(b)) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}

/** Checkout's success signature: HMAC-SHA256 of "order_id|payment_id" with the key secret. */
export function validPaymentSignature(secret: string, orderId: string, paymentId: string, signature: string): boolean {
  return sameHex(hmacHex(secret, `${orderId}|${paymentId}`), signature);
}

/** A webhook's X-Razorpay-Signature: HMAC-SHA256 of the raw body with the webhook secret. */
export function validWebhookSignature(secret: string, rawBody: string, signature: string): boolean {
  return sameHex(hmacHex(secret, rawBody), signature);
}

async function call<T>(config: RazorpayConfig, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${config.apiBase}/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${config.keyId}:${config.keySecret}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: { description?: string } }) | null;
  if (!res.ok || !data) throw new Error(data?.error?.description ?? `Razorpay error (${res.status})`);
  return data;
}

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };
export type RazorpayPayment = { id: string; order_id: string; amount: number; currency: string; status: "created" | "authorized" | "captured" | "refunded" | "failed" };

export function createOrder(config: RazorpayConfig, amountPaise: number, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
  return call<RazorpayOrder>(config, "POST", "/orders", { amount: amountPaise, currency: "INR", receipt: receipt.slice(0, 40), notes });
}

/**
 * The payment, captured if it was only authorised (accounts set to manual
 * capture). Throws if it isn't a successful payment for this order.
 */
export async function capturedPayment(config: RazorpayConfig, paymentId: string, orderId: string): Promise<RazorpayPayment> {
  let payment = await call<RazorpayPayment>(config, "GET", `/payments/${encodeURIComponent(paymentId)}`);
  if (payment.order_id !== orderId) throw new Error("Payment doesn't belong to this order.");
  if (payment.status === "authorized") {
    payment = await call<RazorpayPayment>(config, "POST", `/payments/${encodeURIComponent(paymentId)}/capture`, { amount: payment.amount, currency: payment.currency });
  }
  if (payment.status !== "captured" || payment.currency !== "INR") throw new Error("Payment didn't go through.");
  return payment;
}
