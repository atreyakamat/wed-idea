import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { EventDetailsForm } from "@/components/dashboard/event-details-form";
import { canManage, requireStudio } from "@/lib/auth";
import { DEFAULT_GALLERY_DAYS } from "@/lib/events/form";
import { createEvent } from "../actions";

export const metadata = { title: "New event" };

const EMPTY = {
  couple_names: "",
  slug: "",
  venue: "",
  starts_at: "",
  ends_at: "",
  orders_open_at: "",
  orders_close_at: "",
  gallery_days: String(DEFAULT_GALLERY_DAYS),
  backdrop_brief: "",
};

export default function NewEventPage() {
  return (
    <div className="max-w-3xl">
      <Link href="/dashboard" className="text-sm text-muted hover:text-ink">
        ← Events
      </Link>
      <h1 className="mt-2 font-display text-4xl italic">New event</h1>
      <p className="mt-1 text-sm text-muted">
        You&apos;ll pick the polaroid design and print prices on the next screen.
      </p>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <Suspense fallback={<div className="h-96" aria-hidden />}>
          <NewEventForm />
        </Suspense>
      </div>
    </div>
  );
}

async function NewEventForm() {
  const { studio } = await requireStudio("/dashboard/events/new");
  if (!canManage(studio.role)) redirect("/dashboard");
  return <EventDetailsForm action={createEvent} defaults={EMPTY} submitLabel="Create event" autoSlug />;
}
