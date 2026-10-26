import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { DesignEditor } from "@/components/dashboard/design-editor";
import { EventDetailsForm } from "@/components/dashboard/event-details-form";
import { PrintSettingsForm } from "@/components/dashboard/print-settings-form";
import { StatusBadge } from "@/components/dashboard/status-badge";
import { StatusControls } from "@/components/dashboard/status-controls";
import { canManage, requireStudio } from "@/lib/auth";
import { formatInr } from "@/lib/domain/money";
import { isDesignLocked, themeForEvent } from "@/lib/events/design";
import { galleryDays } from "@/lib/events/form";
import { getEvent } from "@/lib/events/queries";
import { canUnlockDesign, checkTransition, nextStatuses } from "@/lib/events/status";
import { formatIstDate, formatIstTime, isoToIstInput } from "@/lib/events/time";
import { changeStatus, saveDesign, unlockDesign, updateEventDetails, updatePrintSettings } from "../actions";

export const metadata = { title: "Event" };

export default function EventPage({ params }: PageProps<"/dashboard/events/[eventId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <EventView params={params} />
    </Suspense>
  );
}

function paiseToRupeesInput(paise: number | null): string {
  if (paise === null) return "";
  return paise % 100 === 0 ? String(paise / 100) : (paise / 100).toFixed(2);
}

async function EventView({ params }: { params: PageProps<"/dashboard/events/[eventId]">["params"] }) {
  const { eventId } = await params;
  const { studio } = await requireStudio(`/dashboard/events/${eventId}`);
  const event = await getEvent(studio.id, eventId);
  if (!event) notFound();

  const manager = canManage(studio.role);
  const theme = themeForEvent(event);
  const locked = isDesignLocked(event.theme);

  const statusOptions = nextStatuses(event.status).map((to) => {
    const check = checkTransition(event.status, to, locked);
    return {
      to,
      action: changeStatus.bind(null, event.id, to),
      blockedReason: check.allowed ? undefined : check.reason,
    };
  });

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
          ← Events
        </Link>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="font-display text-4xl italic">{event.couple_names}</h1>
              <StatusBadge status={event.status} />
            </div>
            <p className="mt-1 text-sm text-muted">
              {formatIstDate(event.starts_at)}, {formatIstTime(event.starts_at)}–{formatIstTime(event.ends_at)}
              {event.venue ? ` · ${event.venue}` : ""} · /e/{event.slug}
            </p>
          </div>
          {manager ? <StatusControls options={statusOptions} /> : null}
        </div>
      </div>

      <dl className="grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
        <Stat label="Order window" value={`${formatIstTime(event.orders_open_at ?? event.starts_at)}–${formatIstTime(event.orders_close_at ?? event.ends_at)}`} />
        <Stat label="Price per print" value={formatInr(event.print_price_paise)} />
        <Stat label="Limits" value={[event.max_copies_per_guest ? `${event.max_copies_per_guest} per guest` : null, event.budget_cap_paise ? `${formatInr(event.budget_cap_paise)} cap` : null].filter(Boolean).join(" · ") || "None"} />
        <Stat label="Photos kept until" value={formatIstDate(event.gallery_expires_at)} />
      </dl>

      {!manager ? (
        <p className="rounded-xl bg-line/50 px-4 py-3 text-sm text-muted">
          You&apos;re an operator on this studio, so settings are read-only. You&apos;ll run capture at the event.
        </p>
      ) : null}

      <Section
        title="Polaroid design"
        description={locked ? "Locked by the couple." : "Pick a style with the couple, then lock it before the wedding."}
      >
        <DesignEditor
          action={saveDesign.bind(null, event.id)}
          unlockAction={unlockDesign.bind(null, event.id)}
          theme={theme}
          canUnlock={canUnlockDesign(event.status)}
          readOnly={!manager}
        />
      </Section>

      <Section title="Prints & limits" description="The couple pays for every print and courier charge in one statement.">
        <PrintSettingsForm
          action={updatePrintSettings.bind(null, event.id)}
          readOnly={!manager}
          defaults={{
            print_price: paiseToRupeesInput(event.print_price_paise),
            max_copies_per_guest: event.max_copies_per_guest ? String(event.max_copies_per_guest) : "",
            budget_cap: paiseToRupeesInput(event.budget_cap_paise),
          }}
        />
      </Section>

      <Section title="Event details" description="Dates are in India time. The backdrop brief is for whoever builds it.">
        <EventDetailsForm
          action={updateEventDetails.bind(null, event.id)}
          submitLabel="Save details"
          readOnly={!manager}
          defaults={{
            couple_names: event.couple_names,
            slug: event.slug,
            venue: event.venue ?? "",
            starts_at: isoToIstInput(event.starts_at),
            ends_at: isoToIstInput(event.ends_at),
            orders_open_at: isoToIstInput(event.orders_open_at),
            orders_close_at: isoToIstInput(event.orders_close_at),
            gallery_days: String(galleryDays(event.ends_at, event.gallery_expires_at)),
            backdrop_brief: event.backdrop_brief ?? "",
          }}
        />
      </Section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface px-5 py-4">
      <dt className="text-xs font-medium uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 font-semibold">{value}</dd>
    </div>
  );
}

function Section({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return (
    <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
      <h2 className="font-display text-3xl italic">{title}</h2>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <div className="mt-6">{children}</div>
    </section>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="h-12 w-72 animate-pulse rounded-xl bg-line/60" />
      <div className="h-20 animate-pulse rounded-2xl bg-line/60" />
      <div className="h-96 animate-pulse rounded-3xl bg-line/60" />
    </div>
  );
}
