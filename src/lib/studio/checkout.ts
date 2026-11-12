import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { capturedPayment, ORDER_ID_PATTERN, PAYMENT_ID_PATTERN, type RazorpayConfig } from "@/lib/razorpay";

/**
 * Applies a Razorpay payment to its studio, once. Checks with Razorpay that
 * the payment is captured, for this order and the full amount first.
 * Returns the studio's new paid-until.
 */
export async function applyRazorpayPayment(admin: SupabaseClient, config: RazorpayConfig, orderId: string, paymentId: string): Promise<string> {
  if (!ORDER_ID_PATTERN.test(orderId) || !PAYMENT_ID_PATTERN.test(paymentId)) throw new Error("Invalid payment.");
  const payment = await capturedPayment(config, paymentId, orderId);
  const { data, error } = await admin.rpc("apply_razorpay_payment", { p_order: orderId, p_payment: paymentId, p_amount_paise: payment.amount });
  if (error || typeof data !== "string") throw new Error(error?.message ?? "Couldn't apply the payment.");
  return data;
}
