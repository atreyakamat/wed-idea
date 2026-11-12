import { describe, expect, it } from "vitest";
import fixture from "./parity.fixture.json";
import { getLook, LOOKS } from "./data";
import { classify, plan, planFix, render, scoreLooks } from "./engine";
import { measure } from "./features";
import { fromRgbBytes, type Rgb } from "./image";
import { applyLook } from "./render";

// Small scenes and what the PC app's engine makes of them
// (worker/tools/export_looks.py --fixtures). The browser must agree.
type Scene = {
  kind: string;
  width: number;
  height: number;
  pixels: string;
  features: Record<string, number | boolean>;
  lighting: { group: string; scores: Record<string, number> };
  lookScores: Record<string, number>;
  renders: Record<string, string>;
};
const scenes = (fixture as unknown as { scenes: Scene[] }).scenes;

function decode(b64: string, width: number, height: number): Rgb {
  return fromRgbBytes(new Uint8Array(Buffer.from(b64, "base64")), width, height);
}

describe("looks engine matches the PC app", () => {
  for (const scene of scenes) {
    const image = decode(scene.pixels, scene.width, scene.height);

    it(`measures the ${scene.kind} scene the same`, () => {
      const f = measure(image);
      for (const [key, expected] of Object.entries(scene.features)) {
        const actual = f[key as keyof typeof f];
        if (typeof expected === "boolean") expect(actual, key).toBe(expected);
        else expect(actual as number, key).toBeCloseTo(expected, 3);
      }
    });

    it(`sorts the ${scene.kind} scene's light and scores its looks the same`, () => {
      const f = measure(image);
      const lighting = classify(f);
      expect(lighting.group).toBe(scene.lighting.group);
      for (const [g, p] of Object.entries(scene.lighting.scores)) expect(lighting.scores[g as keyof typeof lighting.scores]).toBeCloseTo(p, 2);
      expect(scoreLooks(f, lighting.group)).toEqual(scene.lookScores);
    });

    it(`renders the ${scene.kind} scene's looks within a shade`, () => {
      const f = measure(image);
      const group = classify(f).group;
      for (const [lookId, b64] of Object.entries(scene.renders)) {
        const look = { ...getLook(lookId), grain: 0 };
        const fixed = render(image, f, group, look);
        const expected = decode(b64, scene.width, scene.height);
        let total = 0;
        let worst = 0;
        for (let i = 0; i < fixed.data.length; i++) {
          const d = Math.abs(fixed.data[i] - expected.data[i]);
          total += d;
          worst = Math.max(worst, d);
        }
        const meanDiff = total / fixed.data.length;
        expect(meanDiff, `${lookId} mean`).toBeLessThan(2.5 / 255);
        expect(worst, `${lookId} worst`).toBeLessThan(24 / 255);
      }
    });
  }
});

describe("looks engine", () => {
  const image = decode(scenes[0].pixels, scenes[0].width, scenes[0].height);

  it("has 25 looks, five per kind of light", () => {
    expect(LOOKS).toHaveLength(25);
    expect(new Set(LOOKS.map((l) => l.group)).size).toBe(5);
  });

  it("prefers the studio's favourite look for that light", () => {
    const auto = plan(image);
    expect(auto.look.id).toBe("garden-green");
    const styled = plan(image, { style: { daylight: "soft-pastel" } });
    expect(styled.look.id).toBe("soft-pastel");
    // A favourite for another kind of light changes nothing.
    expect(plan(image, { style: { night: "classic-bw" } }).look.id).toBe("garden-green");
  });

  it("uses a given light and look", () => {
    const p = plan(image, { group: "golden", lookId: "honey-film" });
    expect(p.lighting.group).toBe("golden");
    expect(p.look.id).toBe("honey-film");
  });

  it("gives the same grain for the same seed, different for another", () => {
    const look = getLook("vintage-grain");
    const a = applyLook(image, look, 1, 7);
    const b = applyLook(image, look, 1, 7);
    const c = applyLook(image, look, 1, 8);
    expect(a.data).toEqual(b.data);
    expect(a.data).not.toEqual(c.data);
  });

  it("blends a look in by strength", () => {
    const f = measure(image);
    const fix = planFix(f, "daylight", 0.2);
    expect(fix.ev).toBeGreaterThan(-1);
    const none = applyLook(image, getLook("mono-punch"), 0);
    expect(none.data).toEqual(image.data);
  });
});
