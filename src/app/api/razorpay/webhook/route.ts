import { reportError } from "@/lib/monitoring";
import { razorpayConfig, validWebhookSignature } from "@/lib/razorpay";
import { applyRazorpayPayment } from "@/lib/studio/checkout";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Razorpay webhook (set it up in the Razorpay dashboard for "payment.captured"
 * and "order.paid"). Applies a payment even if the photographer closed the
 * page before Checkout reported back. Applying twice is harmless.
 */
export async function POST(request: Request) {
  const config = razorpayConfig();
  if (!config?.webhookSecret) return new Response("Not set up", { status: 503 });
  const raw = await request.text();
  if (raw.length > 100_000) return new Response("Too large", { status: 413 });
  if (!validWebhookSignature(config.webhookSecret, raw, request.headers.get("x-razorpay-signature") ?? "")) {
    return new Response("Bad signature", { status: 401 });
  }

  let event: { event?: string; payload?: { payment?: { entity?: { id?: string; order_id?: string } } } };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response("Bad body", { status: 400 });
  }
  if (event.event !== "payment.captured" && event.event !== "order.paid") return Response.json({ ignored: event.event ?? null });

  const payment = event.payload?.payment?.entity;
  if (!payment?.id || !payment.order_id) return Response.json({ ignored: "no payment" });
  const admin = createAdminClient();
  const { data: order } = await admin.from("razorpay_orders").select("id").eq("order_id", payment.order_id).maybeSingle();
  // Payments for other things on the same Razorpay account aren't ours.
  if (!order) return Response.json({ ignored: "unknown order" });
  try {
    const paidUntil = await applyRazorpayPayment(admin, config, payment.order_id, payment.id);
    return Response.json({ applied: true, paidUntil });
  } catch (e) {
    const err = e as Error;
    await reportError({ message: `Razorpay webhook: ${err.message}`, stack: err.stack, where: "server", path: "/api/razorpay/webhook" }, process.env.SENTRY_DSN).catch(() => undefined);
    // 500 makes Razorpay retry later.
    return new Response("Couldn't apply", { status: 500 });
  }
}
