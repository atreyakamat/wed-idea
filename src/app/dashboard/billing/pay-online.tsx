"use client";

import { useState, useTransition } from "react";
import { formatInr } from "@/lib/domain/money";
import { confirmCheckout, startCheckout } from "./actions";

const MONTHS = [1, 3, 6, 12] as const;
const CHECKOUT_SCRIPT = "https://checkout.razorpay.com/v1/checkout.js";

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: "INR";
  name: string;
  description: string;
  order_id: string;
  prefill?: { email?: string };
  theme?: { color: string };
  handler: (response: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => void;
  modal?: { ondismiss?: () => void };
};
type RazorpayInstance = { open: () => void; on: (event: "payment.failed", fn: (r: { error?: { description?: string } }) => void) => void };
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

/** Loads Razorpay Checkout once, when someone first pays. */
function loadCheckout(): Promise<void> {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = CHECKOUT_SCRIPT;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      reject(new Error("Couldn't load the payment window. Check your connection."));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export function PayOnline({ planId, planName, pricePaise, brandName, renew }: Readonly<{ planId: string; planName: string; pricePaise: number; brandName: string; renew: boolean }>) {
  const [months, setMonths] = useState<(typeof MONTHS)[number]>(1);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const [paying, setPaying] = useState(false);

  function pay() {
    setMessage(null);
    start(async () => {
      const order = await startCheckout(planId, months);
      if (order.error !== null) {
        setMessage({ tone: "error", text: order.error });
        return;
      }
      try {
        await loadCheckout();
      } catch (e) {
        setMessage({ tone: "error", text: (e as Error).message });
        return;
      }
      if (!window.Razorpay) return;
      setPaying(true);
      const checkout = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: "INR",
        name: brandName,
        description: `${order.studioName}: ${order.description}`,
        order_id: order.orderId,
        prefill: order.email ? { email: order.email } : undefined,
        theme: { color: "#1c1917" },
        handler: (r) => {
          setMessage({ tone: "ok", text: "Payment received. Confirming…" });
          void confirmCheckout(r.razorpay_order_id, r.razorpay_payment_id, r.razorpay_signature).then((done) => {
            setPaying(false);
            if (done.error) setMessage({ tone: "error", text: done.error });
            else
              setMessage({
                tone: "ok",
                text: `Paid, thank you! ${planName} runs until ${new Date(done.paidUntil!).toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" })}.`,
              });
          });
        },
        modal: { ondismiss: () => setPaying(false) },
      });
      checkout.on("payment.failed", (r) => setMessage({ tone: "error", text: r.error?.description ? `Payment failed: ${r.error.description}` : "Payment failed. No money was taken; try again." }));
      checkout.open();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className="sr-only" htmlFor={`months-${planId}`}>
          Months for {planName}
        </label>
        <select
          id={`months-${planId}`}
          value={months}
          onChange={(e) => setMonths(Number(e.target.value) as (typeof MONTHS)[number])}
          className="rounded-full border border-line bg-paper px-3 py-2 text-sm"
        >
          {MONTHS.map((m) => (
            <option key={m} value={m}>
              {m} month{m === 1 ? "" : "s"} · {formatInr(pricePaise * m)}
            </option>
          ))}
        </select>
        <button type="button" onClick={pay} disabled={pending || paying} className="rounded-full bg-ink px-5 py-2 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-60">
          {pending ? "Opening…" : `${renew ? "Renew" : "Pay"} ${formatInr(pricePaise * months)}`}
        </button>
      </div>
      {message ? (
        <p role={message.tone === "error" ? "alert" : "status"} className={`rounded-lg px-3 py-2 text-sm ${message.tone === "error" ? "bg-danger/10 text-danger" : "bg-success/10 text-success"}`}>
          {message.text}
        </p>
      ) : null}
    </div>
  );
}
