import type { Metadata, Viewport } from "next";
import { APP_COLOR, APP_NAME } from "@/lib/pwa/manifest";
import { CameraApp } from "./camera-app";

export const metadata: Metadata = {
  title: "Camera",
  description: "Take photos in the Pixi retro style, on this device. Send them to your studio when you're signed in.",
  appleWebApp: { capable: true, title: APP_NAME, statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: APP_COLOR,
};

/** The camera is open to everyone. Signing in is only needed to send a Roll to a studio. */
export default function CameraPage() {
  return <CameraApp />;
}
