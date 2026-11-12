import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { razorpayConfig, validPaymentSignature, validWebhookSignature, isTestMode } = await import("./razorpay");

const SECRET = "test_secret_123";
const sign = (msg: string, secret = SECRET) => createHmac("sha256", secret).update(msg).digest("hex");

afterEach(() => vi.unstubAllEnvs());

describe("Razorpay signatures", () => {
  it("accept Checkout's signature for this order and payment only", () => {
    const sig = sign("order_ABC123|pay_XYZ789");
    expect(validPaymentSignature(SECRET, "order_ABC123", "pay_XYZ789", sig)).toBe(true);
    expect(validPaymentSignature(SECRET, "order_ABC123", "pay_OTHER1", sig)).toBe(false);
    expect(validPaymentSignature("wrong", "order_ABC123", "pay_XYZ789", sig)).toBe(false);
    expect(validPaymentSignature(SECRET, "order_ABC123", "pay_XYZ789", "nope")).toBe(false);
  });

  it("check a webhook body byte for byte", () => {
    const body = '{"event":"payment.captured"}';
    expect(validWebhookSignature(SECRET, body, sign(body))).toBe(true);
    expect(validWebhookSignature(SECRET, `${body} `, sign(body))).toBe(false);
  });
});

describe("Razorpay keys", () => {
  it("are off until both are set", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "s");
    expect(razorpayConfig()).toBeNull();
    vi.stubEnv("RAZORPAY_KEY_ID", "not-a-key");
    expect(razorpayConfig()).toBeNull();
  });

  it("tell test keys from live ones", () => {
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_test_AbC123");
    vi.stubEnv("RAZORPAY_KEY_SECRET", "s");
    const c = razorpayConfig()!;
    expect(c.apiBase).toBe("https://api.razorpay.com");
    expect(isTestMode(c)).toBe(true);
    vi.stubEnv("RAZORPAY_KEY_ID", "rzp_live_AbC123");
    expect(isTestMode(razorpayConfig()!)).toBe(false);
  });
});
