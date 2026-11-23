import type { CapacitorConfig } from "@capacitor/cli";

// The app opens the live wed-idea site. Set WED_IDEA_URL when building, e.g.
// https://your-studio.netlify.app (no trailing slash). Without it, the app
// shows a clear message instead of a blank screen.
const siteUrl = (process.env.WED_IDEA_URL ?? "").trim().replace(/\/+$/, "");

const config: CapacitorConfig = {
  appId: "in.wedidea.studio",
  appName: "Cute Wedding Polaroid",
  webDir: "www",
  server: siteUrl ? { url: siteUrl, cleartext: false } : undefined,
};

export default config;
