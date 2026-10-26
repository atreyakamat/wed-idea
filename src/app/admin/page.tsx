import type { Metadata } from "next";
import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "./login/actions";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeZone: "Asia/Kolkata",
});

const STATUS_STYLES: Record<string, string> = {
  draft: "bg-line text-muted",
  live: "bg-success/15 text-success",
  closed: "bg-ink/10 text-ink",
  archived: "bg-line text-muted",
};

export default function AdminPage() {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-10 sm:px-6">
      <header className="flex items-center justify-between gap-4 border-b border-line pb-6">
        <div>
          <p className="font-display text-2xl">Cute Wedding Polaroid</p>
          <p className="text-sm text-muted">Admin</p>
        </div>
        {/* The session-dependent part streams in; the shell renders instantly. */}
        <Suspense fallback={<div className="h-9 w-40" aria-hidden />}>
          <AccountBar />
        </Suspense>
      </header>

      <section className="mt-10">
        <h1 className="text-lg font-semibold">Events</h1>
        <Suspense fallback={<EventsSkeleton />}>
          <EventsList />
        </Suspense>
      </section>
    </div>
  );
}

async function AccountBar() {
  const admin = await requireAdmin();
  return (
    <form action={signOut} className="flex items-center gap-3 text-sm">
      <span className="hidden text-muted sm:inline">{admin.email}</span>
      <button
        type="submit"
        className="rounded-lg border border-line px-3 py-2 font-medium hover:bg-line/50"
      >
        Sign out
      </button>
    </form>
  );
}

async function EventsList() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: events, error } = await supabase
    .from("events")
    .select("id, slug, couple_names, venue, starts_at, status")
    .order("starts_at", { ascending: false });

  if (error) {
    return (
      <p role="alert" className="mt-4 rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
        Couldn&apos;t load events: {error.message}
      </p>
    );
  }

  if (!events?.length) {
    return (
      <div className="mt-4 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <p className="font-medium">No events yet</p>
        <p className="mt-1 text-sm text-muted">
          Creating and setting up events comes in the next update.
        </p>
      </div>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-line rounded-2xl border border-line bg-surface">
      {events.map((event) => (
        <li key={event.id} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-medium">{event.couple_names}</p>
            <p className="truncate text-sm text-muted">
              {dateFormat.format(new Date(event.starts_at))}
              {event.venue ? ` · ${event.venue}` : ""} · /e/{event.slug}
            </p>
          </div>
          <span
            className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium capitalize ${STATUS_STYLES[event.status] ?? ""}`}
          >
            {event.status}
          </span>
        </li>
      ))}
    </ul>
  );
}

function EventsSkeleton() {
  return (
    <div className="mt-4 space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-16 animate-pulse rounded-2xl bg-line/60" />
      ))}
    </div>
  );
}
