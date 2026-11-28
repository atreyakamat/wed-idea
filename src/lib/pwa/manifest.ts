import type { MetadataRoute } from "next";

// The app's install manifest. Kept in one place so the route and the tests read the same values.

export const APP_NAME = "Wedding Pola";
/** The camera is what opens when the app is launched from the home screen. */
export const APP_START_URL = "/camera";
/** Matches the camera's black background and theme colour, so the splash and the status bar agree. */
export const APP_COLOR = "#07070a";

export function buildManifest(): MetadataRoute.Manifest {
  return {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Take photos in the Pixi retro style, on this device, and send them to your studio.",
    start_url: APP_START_URL,
    scope: "/",
    display: "standalone",
    background_color: APP_COLOR,
    theme_color: APP_COLOR,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
    ],
  };
}
