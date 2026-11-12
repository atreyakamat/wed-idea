// Error reports to Sentry, without the SDK: a small envelope POST to the
// project's ingest address. Does nothing unless a DSN is set. Private links
// and keys are scrubbed before anything leaves.

type Dsn = { url: string; key: string };

export function parseDsn(dsn: string | undefined | null): Dsn | null {
  if (!dsn) return null;
  try {
    const u = new URL(dsn);
    const project = u.pathname.replace(/^\/+|\/+$/g, "");
    if (!u.username || !/^\d+$/.test(project) || u.protocol !== "https:") return null;
    return { url: `https://${u.host}/api/${project}/envelope/`, key: u.username };
  } catch {
    return null;
  }
}

/** Removes gallery tokens, PC app keys, emails and phone numbers. */
export function scrub(text: string): string {
  return text
    .replace(/\/(p|g)\/[0-9a-f]{24,64}/gi, "/$1/[link]")
    .replace(/cwp_wk_[0-9a-f]{48}/gi, "cwp_wk_[key]")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{8,}\d/g, "[number]");
}

export type ErrorReport = {
  message: string;
  stack?: string;
  where: "server" | "browser";
  path?: string;
  digest?: string;
};

export function envelope(report: ErrorReport, dsn: Dsn, now: Date = new Date()): string {
  const eventId = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join("");
  const event = {
    event_id: eventId,
    timestamp: now.toISOString(),
    platform: "javascript",
    level: "error",
    tags: { where: report.where, ...(report.digest ? { digest: report.digest } : {}) },
    transaction: report.path ? scrub(report.path) : undefined,
    exception: { values: [{ type: "Error", value: scrub(report.message).slice(0, 2000) }] },
    extra: report.stack ? { stack: scrub(report.stack).slice(0, 8000) } : undefined,
  };
  return [JSON.stringify({ event_id: eventId, sent_at: now.toISOString(), dsn: `https://${dsn.key}@x/0` }), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

export async function reportError(report: ErrorReport, dsnValue: string | undefined | null): Promise<void> {
  const dsn = parseDsn(dsnValue);
  if (!dsn) return;
  try {
    await fetch(dsn.url, {
      method: "POST",
      headers: { "Content-Type": "application/x-sentry-envelope", "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${dsn.key}, sentry_client=cwp/1.0` },
      body: envelope(report, dsn),
      keepalive: true,
    });
  } catch {
    // Monitoring must never break the app.
  }
}
