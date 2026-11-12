import { reportError } from "@/lib/monitoring";

// Browser errors go to Sentry when NEXT_PUBLIC_SENTRY_DSN is set.
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
let sent = 0;

function send(error: unknown) {
  if (!dsn || sent >= 10) return; // a broken page shouldn't flood the inbox
  sent++;
  const e = error instanceof Error ? error : new Error(String(error));
  void reportError({ message: e.message, stack: e.stack, where: "browser", path: window.location.pathname }, dsn);
}

if (dsn) {
  window.addEventListener("error", (event) => send(event.error ?? event.message));
  window.addEventListener("unhandledrejection", (event) => send(event.reason));
}
