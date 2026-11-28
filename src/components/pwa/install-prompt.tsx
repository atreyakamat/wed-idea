"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

/**
 * "Install Wedding Pola". Shows the browser's install button when the browser offers one, and on
 * iPhone and iPad a one-line hint, since Safari has no install button. Hidden once the app is
 * already installed and open.
 */
// The device never changes while the page is open, so these never need to notify React.
const noChange = () => () => undefined;
const isIosDevice = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const isInstalledApp = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const no = () => false;

export function InstallPrompt({ variant }: { variant: "camera" | "header" }) {
  const [deferred, setDeferred] = useState<InstallEvent | null>(null);
  const ios = useSyncExternalStore(noChange, isIosDevice, no);
  const standalone = useSyncExternalStore(noChange, isInstalledApp, no);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as InstallEvent);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (standalone) return null;

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice.catch(() => undefined);
    setDeferred(null);
  };

  if (deferred) {
    return (
      <div className={variant === "camera" ? "pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-50 flex justify-center px-4" : "flex"}>
        <button
          type="button"
          onClick={() => void install()}
          className="pointer-events-auto whitespace-nowrap rounded-full border border-current/20 bg-black/70 px-4 py-2 text-sm font-medium text-white backdrop-blur"
        >
          Install Wedding Pola
        </button>
      </div>
    );
  }

  if (ios) {
    return (
      <p className={variant === "camera" ? "pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+12px)] z-50 text-center text-xs text-white/80" : "text-xs text-muted"}>
        To install, tap Share, then Add to Home Screen.
      </p>
    );
  }

  return null;
}
