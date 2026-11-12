"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/ui/form";
import { requireStudioManager } from "@/lib/auth";
import { formText } from "@/lib/form-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { createOrder, isTestMode, PAY_MONTHS, razorpayConfig, validPaymentSignature } from "@/lib/razorpay";
import { allow } from "@/lib/rate-limit";
import { listPlans } from "@/lib/studio/billing";
import { applyRazorpayPayment } from "@/lib/studio/checkout";

/** Asks to move to a paid plan. One open request per studio; asking again replaces it. */
export async function requestPlan(planId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { studio } = await requireStudioManager();
  const note = formText(formData, "note");
  if (note.length > 500) return { error: null, fieldErrors: { note: "Keep it under 500 characters" }, values: { note } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("request_plan", { p_org: studio.id, p_plan: planId, p_note: note || null });
  if (error) return { error: error.code === "22023" ? error.message : "Couldn't send your request. Try again.", values: { note } };

  refresh();
  return { error: null, success: "Request sent. We'll get in touch to set up payment." };
}

export type CheckoutStart =
  | { error: string }
  | { error: null; keyId: string; orderId: string; amount: number; studioName: string; description: string; email: string | null; testMode: boolean };

/** Makes a Razorpay order for a plan and number of months; the browser then opens Checkout. */
export async function startCheckout(planId: string, months: number): Promise<CheckoutStart> {
  const { user, studio } = await requireStudioManager();
  const config = razorpayConfig();
  if (!config) return { error: "Online payment isn't set up yet. Use Request instead." };
  if (studio.status === "suspended") return { error: "This studio is suspended. Contact support." };
  if (!(PAY_MONTHS as readonly number[]).includes(months)) return { error: "Choose how many months." };
  if (!(await allow(`checkout:${studio.id}`, 20, 60 * 60))) return { error: "Too many tries. Wait a little and try again." };

  const plan = (await listPlans()).find((p) => p.id === planId && !p.is_trial);
  if (!plan || plan.price_paise <= 0) return { error: "Choose a paid plan." };
  const amount = plan.price_paise * months;

  try {
    const order = await createOrder(config, amount, `${studio.id.slice(0, 8)}-${plan.id}-${months}m`, { studio: studio.id, plan: plan.id, months: String(months) });
    const { error } = await createAdminClient()
      .from("razorpay_orders")
      .insert({ organization_id: studio.id, plan_id: plan.id, months, amount_paise: amount, order_id: order.id, created_by: user.id });
    if (error) throw new Error(error.message);
    return {
      error: null,
      keyId: config.keyId,
      orderId: order.id,
      amount,
      studioName: studio.name,
      description: `${plan.name} plan, ${months} month${months === 1 ? "" : "s"}`,
      email: user.email,
      testMode: isTestMode(config),
    };
  } catch {
    return { error: "Couldn't start the payment. Try again in a minute." };
  }
}

/** Called by Checkout's success handler: checks the signature, then applies the payment. */
export async function confirmCheckout(orderId: string, paymentId: string, signature: string): Promise<{ error: string | null; paidUntil?: string }> {
  const { studio } = await requireStudioManager();
  const config = razorpayConfig();
  if (!config) return { error: "Online payment isn't set up." };
  if (![orderId, paymentId, signature].every((v) => typeof v === "string") || !validPaymentSignature(config.keySecret, orderId, paymentId, signature)) {
    return { error: "We couldn't verify that payment. If money left your account, it will show here within a few minutes, or contact us." };
  }
  const admin = createAdminClient();
  const { data: order } = await admin.from("razorpay_orders").select("organization_id").eq("order_id", orderId).maybeSingle<{ organization_id: string }>();
  if (!order || order.organization_id !== studio.id) return { error: "That payment isn't for this studio." };
  try {
    const paidUntil = await applyRazorpayPayment(admin, config, orderId, paymentId);
    refresh();
    return { error: null, paidUntil };
  } catch {
    return { error: "Payment received but not applied yet. It will show here within a few minutes; contact us if it doesn't." };
  }
}
