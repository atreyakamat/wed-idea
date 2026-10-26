import { CARD_HEIGHT_MM, CARD_WIDTH_MM } from "@/lib/polaroid/types";

/** Exported polaroids are 300 dpi: 638 × 1016 px for a 5.4 × 8.6 cm card. */
export const EXPORT_DPI = 300;
const MM_PER_INCH = 25.4;

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Couldn't download the photo.");
  return blobToDataUrl(await res.blob());
}

/** The @font-face rules for the given families, with font files inlined. */
async function inlineFontFaces(families: Set<string>): Promise<string> {
  const rules: CSSFontFaceRule[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    let cssRules: CSSRuleList;
    try {
      cssRules = sheet.cssRules;
    } catch {
      continue; // Cross-origin stylesheet.
    }
    for (const rule of Array.from(cssRules)) {
      if (rule instanceof CSSFontFaceRule) {
        const family = rule.style.getPropertyValue("font-family").replace(/["']/g, "").trim();
        if (families.has(family)) rules.push(rule);
      }
    }
  }

  const css = await Promise.all(
    rules.map(async (rule) => {
      const src = rule.style.getPropertyValue("src");
      const match = /url\(["']?([^"')]+)["']?\)/.exec(src);
      if (!match) return "";
      const fontUrl = new URL(match[1], rule.parentStyleSheet?.href ?? document.baseURI).href;
      try {
        const dataUrl = await urlToDataUrl(fontUrl);
        return rule.cssText.replace(match[0], `url(${dataUrl})`);
      } catch {
        return "";
      }
    }),
  );
  return css.join("\n");
}

/**
 * Renders an on-screen polaroid <svg> to a 300 dpi PNG. The photo and fonts
 * are inlined first, because an SVG drawn into a canvas can't load outside
 * files or use the page's CSS variables.
 */
export async function exportPolaroidPng(svg: SVGSVGElement): Promise<Blob> {
  const width = Math.round((CARD_WIDTH_MM / MM_PER_INCH) * EXPORT_DPI);
  const height = Math.round((CARD_HEIGHT_MM / MM_PER_INCH) * EXPORT_DPI);

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("width", String(width));
  clone.setAttribute("height", String(height));
  clone.removeAttribute("class");

  // Fonts: resolve the CSS variables to real family names.
  const families = new Set<string>();
  const originalTexts = svg.querySelectorAll("text");
  clone.querySelectorAll("text").forEach((text, i) => {
    const computed = getComputedStyle(originalTexts[i]).fontFamily;
    text.style.fontFamily = computed;
    computed.split(",").forEach((f) => families.add(f.replace(/["']/g, "").trim()));
  });

  // Photo: inline as data URL.
  await Promise.all(
    Array.from(clone.querySelectorAll("image")).map(async (image) => {
      const href = image.getAttribute("href");
      if (href && !href.startsWith("data:")) image.setAttribute("href", await urlToDataUrl(href));
    }),
  );

  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");
  style.textContent = await inlineFontFaces(families);
  clone.insertBefore(style, clone.firstChild);

  const markup = new XMLSerializer().serializeToString(clone);
  const svgUrl = URL.createObjectURL(new Blob([markup], { type: "image/svg+xml" }));
  try {
    const img = new Image();
    img.decoding = "sync";
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Couldn't draw the polaroid."));
      img.src = svgUrl;
    });
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't draw the polaroid.");
    ctx.drawImage(img, 0, 0, width, height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!png) throw new Error("Couldn't save the polaroid.");
    return png;
  } finally {
    URL.revokeObjectURL(svgUrl);
  }
}

/** Saves a blob through a temporary download link. */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
