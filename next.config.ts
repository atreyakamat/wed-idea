import type { NextConfig } from "next";

// The Pixi studio app (a separate, browser-based app) may call the worker API
// from its own address. Set PIXI_STUDIO_ORIGIN to that address, e.g.
// https://pixi-studio.netlify.app. Unset, no other site is allowed.
const pixiOrigin = process.env.PIXI_STUDIO_ORIGIN?.trim().replace(/\/+$/, "") || null;

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  ...(pixiOrigin
    ? {
        async headers() {
          return [
            {
              source: "/api/worker/:path*",
              headers: [
                { key: "Access-Control-Allow-Origin", value: pixiOrigin },
                { key: "Access-Control-Allow-Methods", value: "GET, POST, OPTIONS" },
                { key: "Access-Control-Allow-Headers", value: "Authorization, Content-Type" },
                { key: "Vary", value: "Origin" },
              ],
            },
          ];
        },
      }
    : {}),
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
