import { ImageResponse } from "next/og";
import { BRAND_NAME } from "@/lib/brand";

export const alt = `${BRAND_NAME}: edited event photos in your guests' hands within the hour`;
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Share card for the site: warm paper, a fan of tinted "prints", the promise.
export default function Image() {
  const prints = [
    { bg: "#d9a066", rotate: -9, x: 640 },
    { bg: "#7f9fb8", rotate: 7, x: 820 },
    { bg: "#c2546b", rotate: -2, x: 730 },
  ];
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: "#fbf8f3", color: "#221c18", position: "relative", fontFamily: "serif" }}>
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 80px", width: 620 }}>
          <div style={{ fontSize: 30, color: "#c2546b", fontStyle: "italic" }}>{BRAND_NAME}</div>
          <div style={{ fontSize: 76, lineHeight: 1.05, marginTop: 18 }}>Guests get their photos tonight.</div>
          <div style={{ fontSize: 28, color: "#6f655d", marginTop: 26, fontFamily: "sans-serif" }}>Auto-edited to their light. One private link on WhatsApp.</div>
        </div>
        {prints.map((p, i) => (
          <div
            key={i}
            style={{
              position: "absolute",
              left: p.x,
              top: 120,
              width: 250,
              height: 330,
              background: "#ffffff",
              transform: `rotate(${p.rotate}deg)`,
              boxShadow: "0 20px 40px rgba(34,28,24,0.18)",
              display: "flex",
              padding: 16,
              paddingBottom: 70,
            }}
          >
            <div style={{ flex: 1, background: p.bg, display: "flex" }} />
          </div>
        ))}
      </div>
    ),
    size,
  );
}
