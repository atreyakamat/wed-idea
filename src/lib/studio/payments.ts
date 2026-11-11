export type PaymentMethod = "upi" | "bank_transfer" | "cash" | "razorpay" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  razorpay: "Razorpay",
  other: "Other",
};

/** Methods an admin records by hand. Razorpay payments will arrive by webhook. */
export const MANUAL_METHODS: PaymentMethod[] = ["upi", "bank_transfer", "cash", "other"];

export function isManualMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (MANUAL_METHODS as string[]).includes(value);
}
