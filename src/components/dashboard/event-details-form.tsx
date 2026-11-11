"use client";

import { useActionState, useState } from "react";
import { Field, FormMessage, initialFormState, SubmitButton, TextAreaField, type FormState } from "@/components/ui/form";
import { slugify } from "@/lib/domain/slug";

export type EventDetailsDefaults = {
  couple_names: string;
  slug: string;
  venue: string;
  starts_at: string;
  ends_at: string;
  orders_open_at: string;
  orders_close_at: string;
  gallery_days: string;
  backdrop_brief: string;
};

type Props = {
  /** The start can't change once an event has been live. */
  startLocked?: boolean;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
  defaults: EventDetailsDefaults;
  submitLabel: string;
  /** New events suggest the link from the couple's names. */
  autoSlug?: boolean;
  readOnly?: boolean;
};

export function EventDetailsForm({ action, defaults, submitLabel, autoSlug = false, readOnly = false, startLocked = false }: Props) {
  const [state, formAction] = useActionState(action, initialFormState);
  const v = { ...defaults, ...state.values };
  const e = state.fieldErrors ?? {};
  const [names, setNames] = useState(v.couple_names);
  const [slug, setSlug] = useState(v.slug);
  const [slugEdited, setSlugEdited] = useState(!autoSlug || Boolean(v.slug));
  const shownSlug = slugEdited ? slug : slugify(names);

  return (
    <form action={formAction} className="flex flex-col gap-6" noValidate>
      <fieldset disabled={readOnly} className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Couple"
          name="couple_names"
          required
          maxLength={120}
          placeholder="Priya & Rahul"
          value={names}
          onChange={(ev) => setNames(ev.target.value)}
          error={e.couple_names}
        />
        <Field
          label="Event link"
          name="slug"
          required
          maxLength={60}
          value={shownSlug}
          onChange={(ev) => {
            setSlugEdited(true);
            setSlug(ev.target.value.toLowerCase());
          }}
          hint={<>Guests see /e/{shownSlug || "your-link"}</>}
          error={e.slug}
        />
        <Field label="Venue" name="venue" maxLength={160} placeholder="Assagao, Goa" defaultValue={v.venue} error={e.venue} className="sm:col-span-2" />
        <Field
          label="Starts"
          name="starts_at"
          type="datetime-local"
          required
          readOnly={startLocked}
          defaultValue={v.starts_at}
          error={e.starts_at}
          hint={startLocked ? "Fixed once the event has been live." : "India time (IST)"}
        />
        <Field label="Ends" name="ends_at" type="datetime-local" required defaultValue={v.ends_at} error={e.ends_at} />
        <Field
          label="Print orders open"
          name="orders_open_at"
          type="datetime-local"
          defaultValue={v.orders_open_at}
          error={e.orders_open_at}
          hint="Leave blank to match the event start"
        />
        <Field
          label="Print orders close"
          name="orders_close_at"
          type="datetime-local"
          defaultValue={v.orders_close_at}
          error={e.orders_close_at}
          hint="Leave blank to match the event end"
        />
        <Field
          label="Keep photos for"
          name="gallery_days"
          type="number"
          inputMode="numeric"
          min={1}
          max={30}
          defaultValue={v.gallery_days}
          error={e.gallery_days}
          hint="Days after the event. Photos are deleted after this."
        />
        <TextAreaField
          label="Backdrop brief"
          name="backdrop_brief"
          maxLength={2000}
          rows={4}
          placeholder="Colours, flowers, signage, size, where it stands…"
          defaultValue={v.backdrop_brief}
          error={e.backdrop_brief}
          hint="The client's custom backdrop, for whoever builds it."
          className="sm:col-span-2"
        />
      </fieldset>
      <FormMessage state={state} />
      {readOnly ? null : (
        <div>
          <SubmitButton>{submitLabel}</SubmitButton>
        </div>
      )}
    </form>
  );
}
