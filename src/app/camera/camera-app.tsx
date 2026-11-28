"use client";

import dynamic from "next/dynamic";
import "@/pixi/pixi.css";
import { InstallPrompt } from "@/components/pwa/install-prompt";

// The camera needs the browser (camera, storage, canvas), so it is never rendered on the server.
const PixiApp = dynamic(() => import("@/pixi/shell/PixiApp"), {
  ssr: false,
  loading: () => <div className="pixi-root" aria-busy="true" />,
});

export function CameraApp() {
  return (
    <div className="pixi-root">
      <PixiApp />
      <InstallPrompt variant="camera" />
    </div>
  );
}
