import Link from "next/link";
import { Suspense } from "react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import { canManage, requireStudio } from "@/lib/auth";
import { isDesignLocked, themeForEvent } from "@/lib/events/design";
import { SAMPLE_PHOTO } from "@/lib/polaroid/samples";
import { listEvents } from "@/lib/events/queries";
import { formatIstDate } from "@/lib/events/time";
import { resolveTheme } from "@/lib/polaroid/theme";

export const metadata = { title: "Events" };

export default function DashboardPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl italic">Events</h1>
          <p className="mt-1 text-sm text-muted">Each wedding gets its own design, order window and guest gallery.</p>
        </div>
        <Suspense fallback={null}>
          <NewEventButton />
        </Suspense>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <EventList />
      </Suspense>
    </>
  );
}

async function NewEventButton() {
  const { studio } = await requireStudio("/dashboard");
  if (!canManage(studio.role)) return null;
  return (
    <Link href="/dashboard/events/new" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90">
      New event
    </Link>
  );
}

async function EventList() {
  const { studio } = await requireStudio("/dashboard");
  const events = await listEvents(studio.id);

  if (events.length === 0) {
    return (
      <div className="mt-8 rounded-3xl border border-dashed border-line px-6 py-16 text-center">
        <p className="font-display text-2xl italic">No events yet</p>
        <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
          Create your first wedding, pick its polaroid design, and you&apos;re ready for the backdrop.
        </p>
        {canManage(studio.role) ? (
          <Link href="/dashboard/events/new" className="mt-6 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper">
            Create an event
          </Link>
        ) : null}
      </div>
    );
  }

  return (
    <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {events.map((event) => {
        const { template, palette, text, filterId } = resolveTheme(themeForEvent(event));
        return (
          <li key={event.id}>
            <Link
              href={`/dashboard/events/${event.id}`}
              className="flex h-full gap-4 rounded-2xl border border-line bg-surface p-4 transition hover:border-ink/40 hover:shadow-md"
            >
              <PolaroidCard
                uid={`list-${event.id}`}
                template={template}
                palette={palette}
                text={text}
                filterId={filterId}
                photoHref={SAMPLE_PHOTO}
                className="w-16 shrink-0 shadow-sm"
              />
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate font-semibold">{event.couple_names}</p>
                  <StatusBadge status={event.status} />
                </div>
                <p className="mt-1 truncate text-sm text-muted">
                  {formatIstDate(event.starts_at)}
                  {event.venue ? ` · ${event.venue}` : ""}
                </p>
                <p className="mt-auto pt-3 text-xs text-muted">
                  {template.name} · {isDesignLocked(event.theme) ? "design locked" : "design not locked"}
                </p>
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-32 animate-pulse rounded-2xl bg-line/60" />
      ))}
    </div>
  );
}
