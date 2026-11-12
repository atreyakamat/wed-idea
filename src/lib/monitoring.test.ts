import { describe, expect, it } from "vitest";
import { envelope, parseDsn, scrub } from "./monitoring";

describe("monitoring", () => {
  it("reads a Sentry DSN", () => {
    expect(parseDsn("https://abc123@o1.ingest.sentry.io/456")).toEqual({ url: "https://o1.ingest.sentry.io/api/456/envelope/", key: "abc123" });
    expect(parseDsn("")).toBeNull();
    expect(parseDsn("http://abc@host/1")).toBeNull();
    expect(parseDsn("not a url")).toBeNull();
  });

  it("never sends private links, keys, emails or numbers", () => {
    const text = `failed at /p/${"a1".repeat(24)} and /g/${"b2".repeat(16)} with cwp_wk_${"c".repeat(48)} for asha@studio.in on +91 98765 43210`;
    const out = scrub(text);
    expect(out).toBe("failed at /p/[link] and /g/[link] with cwp_wk_[key] for [email] on [number]");
  });

  it("builds a scrubbed envelope", () => {
    const body = envelope({ message: `boom /p/${"f".repeat(48)}`, where: "server", path: `/p/${"f".repeat(48)}` }, { url: "x", key: "k" }, new Date("2026-11-12T00:00:00Z"));
    const [, type, event] = body.split("\n").map((l) => JSON.parse(l));
    expect(type).toEqual({ type: "event" });
    expect(event.exception.values[0].value).toBe("boom /p/[link]");
    expect(event.transaction).toBe("/p/[link]");
  });
});
