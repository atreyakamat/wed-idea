import type { Instrumentation } from "next";
import { reportError } from "@/lib/monitoring";

/** Server errors go to Sentry when SENTRY_DSN is set (no-op otherwise). */
export const onRequestError: Instrumentation.onRequestError = async (err, request) => {
  const error = err instanceof Error ? err : new Error(String(err));
  const digest = typeof err === "object" && err !== null && "digest" in err ? String((err as { digest: unknown }).digest) : undefined;
  await reportError({ message: error.message, stack: error.stack, where: "server", path: request.path, digest }, process.env.SENTRY_DSN);
};
