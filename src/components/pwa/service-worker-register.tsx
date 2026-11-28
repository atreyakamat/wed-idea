"use client";

import { useEffect } from "react";

/**
 * Registers /sw.js for the whole site, so the camera can open offline after the first visit and
 * the app can be installed. The worker caches only the camera and static files (see public/sw.js).
 * Production only, and only where the browser calls the page a secure context (https or localhost).
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Blocked or private mode: the site still works, just not offline.
    });
  }, []);
  return null;
}
