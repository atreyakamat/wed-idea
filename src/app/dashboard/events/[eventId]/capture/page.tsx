import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { requireStudio } from "@/lib/auth";
import { listRecentGuests } from "@/lib/capture/queries";
import { publicEnv } from "@/lib/env";
import { themeForEvent } from "@/lib/events/design";
import { getEvent } from "@/lib/events/queries";
import { resolveTheme } from "@/lib/polaroid/theme";
import { CaptureStation } from "./capture-station";

export const metadata = { title: "Capture" };

export default function CapturePage({ params }: PageProps<"/dashboard/events/[eventId]/capture">) {
  return (
    <Suspense fallback={<div className="h-96 animate-pulse rounded-3xl bg-line/60" aria-hidden />}>
      <Capture params={params} />
    </Suspense>
  );
}

async function Capture({ params }: Readonly<{ params: PageProps<"/dashboard/events/[eventId]/capture">["params"] }>) {
  const { eventId } = await params;
  const { studio } = await requireStudio(`/dashboard/events/${eventId}/capture`);
  const event = await getEvent(studio.id, eventId);
  if (!event) notFound();

  const header = (
    <div className="mb-6">
      <Link href={`/dashboard/events/${event.id}`} className="text-sm text-muted hover:text-ink">
        ← {event.couple_names}
      </Link>
      <div className="mt-1 flex flex-wrap items-center gap-3">
        <h1 className="font-display text-4xl italic">Capture</h1>
        <StatusBadge status={event.status} />
      </div>
    </div>
  );

  if (event.status !== "live") {
    return (
      <>
        {header}
        <div className="rounded-3xl border border-dashed border-line px-6 py-14 text-center">
          <p className="font-display text-2xl italic">Capture opens when the event is live</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Lock the polaroid design and press Go live on the event page. Guests&apos; photos only go out from a live event.
          </p>
          <Link href={`/dashboard/events/${event.id}`} className="mt-6 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper">
            Go to event
          </Link>
        </div>
      </>
    );
  }

  const { template, palette, text, filterId } = resolveTheme(themeForEvent(event));
  const recentGuests = await listRecentGuests(event.id);

  return (
    <>
      {header}
      <CaptureStation
        eventId={event.id}
        organizationId={event.organization_id}
        coupleNames={event.couple_names}
        galleryExpiresAt={event.gallery_expires_at}
        siteUrl={publicEnv().NEXT_PUBLIC_SITE_URL}
        design={{ template, palette, text, filterId }}
        recentGuests={recentGuests}
      />
    </>
  );
}
