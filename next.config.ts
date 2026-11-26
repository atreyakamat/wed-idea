import type { NextConfig } from "next";

/**
 * The origin of the Wedding Pola app (for example "https://wedpola.example"),
 * allowed to call /api/worker/* from a browser. Unset means no cross-origin
 * access at all, which is the behaviour before the web app existed.
 */
function pixiOrigin(): string | null {
  const raw = process.env.PIXI_STUDIO_ORIGIN?.trim();
  if (!raw) return null;
  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    const origin = pixiOrigin();
    if (!origin) return [];
    return [
      {
        source: "/api/worker/:path*",
        headers: [
          { key: "Access-Control-Allow-Origin", value: origin },
          { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
          { key: "Access-Control-Max-Age", value: "600" },
        ],
      },
    ];
  },
};

export default nextConfig;
