import { describe, expect, it } from "vitest";
import {
  GUEST_CODE_CAPACITY,
  GUEST_CODE_LETTERS,
  isValidGuestCode,
  normalizeGuestCode,
  pickGuestCode,
} from "./guest-code";
import { isValidSlug, slugify } from "./slug";
import { formatInr, rupeesToPaise } from "./money";
import { normalizePhone } from "./phone";
import { isOrderWindowOpen } from "./order-window";
import { computeStatement, remainingBudgetPaise } from "./billing";

describe("guest codes", () => {
  it("validates the letter + two digits format without I or O", () => {
    expect(isValidGuestCode("A17")).toBe(true);
    expect(isValidGuestCode("Z00")).toBe(true);
    expect(isValidGuestCode("I17")).toBe(false);
    expect(isValidGuestCode("O17")).toBe(false);
    expect(isValidGuestCode("a17")).toBe(false);
    expect(isValidGuestCode("A7")).toBe(false);
  });

  it("normalises operator input", () => {
    expect(normalizeGuestCode(" a 17 ")).toBe("A17");
  });

  it("never returns a taken code", () => {
    const taken = new Set(["A00", "A01"]);
    const sequence = [0, 0.0001, 0.5];
    let i = 0;
    const code = pickGuestCode(taken, () => sequence[i++ % sequence.length]);
    expect(taken.has(code)).toBe(false);
    expect(isValidGuestCode(code)).toBe(true);
  });

  it("finds the last free code when nearly full", () => {
    const all: string[] = [];
    for (const letter of GUEST_CODE_LETTERS) {
      for (let n = 0; n < 100; n++) all.push(`${letter}${String(n).padStart(2, "0")}`);
    }
    const taken = new Set(all.filter((c) => c !== "Q42"));
    expect(pickGuestCode(taken, () => 0)).toBe("Q42");
  });

  it("throws when every code is used", () => {
    const taken = new Set(Array.from({ length: GUEST_CODE_CAPACITY }, (_, i) => String(i)));
    expect(() => pickGuestCode(taken)).toThrow(/No guest codes left/);
  });
});

describe("slugs", () => {
  it("builds link-safe slugs from couple names", () => {
    expect(slugify("Priya & Rahul")).toBe("priya-rahul");
    expect(slugify("  Zoë   D'Souza + Ankit ")).toBe("zoe-d-souza-ankit");
    expect(slugify("!!!")).toBe("");
  });

  it("caps length without a trailing dash", () => {
    const slug = slugify(`${"a".repeat(59)} b`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });

  it("matches the database rule", () => {
    expect(isValidSlug("priya-rahul")).toBe(true);
    expect(isValidSlug("ab")).toBe(false);
    expect(isValidSlug("Priya-Rahul")).toBe(false);
    expect(isValidSlug("priya--rahul")).toBe(false);
  });
});

describe("money", () => {
  it("formats paise as Indian rupees", () => {
    expect(formatInr(4900)).toBe("₹49");
    expect(formatInr(12345050)).toBe("₹1,23,450.5");
  });

  it("rejects fractional paise", () => {
    expect(() => formatInr(10.5)).toThrow();
  });

  it("parses typed rupee amounts", () => {
    expect(rupeesToPaise("49")).toBe(4900);
    expect(rupeesToPaise("1,250.5")).toBe(125050);
    expect(rupeesToPaise("₹ 99.99")).toBe(9999);
    expect(rupeesToPaise("-5")).toBeNull();
    expect(rupeesToPaise("1.234")).toBeNull();
    // Above what the database can store (about ₹2.1 crore).
    expect(rupeesToPaise("21474836.47")).toBe(2147483647);
    expect(rupeesToPaise("21474836.48")).toBeNull();
    expect(rupeesToPaise("abc")).toBeNull();
  });
});

describe("phone numbers", () => {
  it("normalises Indian mobiles", () => {
    expect(normalizePhone("98123 45678")).toBe("+919812345678");
    expect(normalizePhone("098123-45678")).toBe("+919812345678");
    expect(normalizePhone("919812345678")).toBe("+919812345678");
    expect(normalizePhone("+91 98123 45678")).toBe("+919812345678");
  });

  it("keeps international numbers", () => {
    expect(normalizePhone("+971 50 123 4567")).toBe("+971501234567");
  });

  it("rejects invalid numbers", () => {
    expect(normalizePhone("12345")).toBeNull();
    expect(normalizePhone("5812345678")).toBeNull();
    expect(normalizePhone("+91 5812345678")).toBeNull();
    expect(normalizePhone("")).toBeNull();
  });
});

describe("order window", () => {
  const event = {
    status: "live" as const,
    orders_open_at: "2026-12-12T09:00:00+05:30",
    orders_close_at: "2026-12-12T17:00:00+05:30",
  };

  it("is open only between open and close while live", () => {
    expect(isOrderWindowOpen(event, new Date("2026-12-12T08:59:00+05:30"))).toBe(false);
    expect(isOrderWindowOpen(event, new Date("2026-12-12T09:00:00+05:30"))).toBe(true);
    expect(isOrderWindowOpen(event, new Date("2026-12-12T16:59:00+05:30"))).toBe(true);
    expect(isOrderWindowOpen(event, new Date("2026-12-12T17:00:00+05:30"))).toBe(false);
  });

  it("is closed for non-live events or missing times", () => {
    const noon = new Date("2026-12-12T12:00:00+05:30");
    expect(isOrderWindowOpen({ ...event, status: "closed" }, noon)).toBe(false);
    expect(isOrderWindowOpen({ ...event, orders_open_at: null }, noon)).toBe(false);
  });
});

describe("couple's statement", () => {
  const orders = [
    {
      status: "dispatched",
      courier_charge_paise: 6500,
      items: [
        { copies: 3, unit_price_paise: 4900 },
        { copies: 1, unit_price_paise: 4900 },
      ],
    },
    { status: "cancelled", courier_charge_paise: 8000, items: [{ copies: 2, unit_price_paise: 4900 }] },
  ];

  it("totals prints and courier, ignoring cancelled orders", () => {
    expect(computeStatement(orders)).toEqual({
      orderCount: 1,
      copies: 4,
      printsPaise: 19600,
      courierPaise: 6500,
      totalPaise: 26100,
    });
  });

  it("reports remaining budget against the couple's cap", () => {
    const statement = computeStatement(orders);
    expect(remainingBudgetPaise(statement, 50000)).toBe(23900);
    expect(remainingBudgetPaise(statement, 10000)).toBe(0);
    expect(remainingBudgetPaise(statement, null)).toBeNull();
  });
});
