"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import { Field, inputClass } from "@/components/ui/form";
import { photoPaths } from "@/lib/capture/photos";
import { processImage } from "@/lib/capture/process-image";
import { formatPhone, galleryUrl, whatsappLink, whatsappMessage } from "@/lib/capture/share";
import type { CaptureGuest, StartGuestState } from "@/lib/capture/types";
import type { CardText, Palette, PolaroidTemplate } from "@/lib/polaroid/types";
import { createClient } from "@/lib/supabase/client";
import { markLinkSent, savePhoto, startGuest } from "./actions";

type Shot = {
  id: string;
  previewUrl: string;
  name: string;
  status: "processing" | "uploading" | "done" | "error";
  error?: string;
};

type Props = {
  eventId: string;
  organizationId: string;
  coupleNames: string;
  galleryExpiresAt: string;
  siteUrl: string;
  design: { template: PolaroidTemplate; palette: Palette; text: CardText; filterId: string };
  recentGuests: CaptureGuest[];
};

const initialState: StartGuestState = { error: null };
const UPLOADS_AT_ONCE = 2;

export function CaptureStation({ eventId, organizationId, coupleNames, galleryExpiresAt, siteUrl, design, recentGuests }: Readonly<Props>) {
  const router = useRouter();
  const start = useMemo(() => startGuest.bind(null, eventId), [eventId]);
  const [state, formAction, starting] = useActionState(start, initialState);
  const [guest, setGuest] = useState<CaptureGuest | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [sent, setSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, startTransition] = useTransition();
  const cameraInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const lastHandled = useRef<StartGuestState | null>(null);
  const previewUrls = useRef<string[]>([]);

  function releasePreviews() {
    previewUrls.current.forEach((url) => URL.revokeObjectURL(url));
    previewUrls.current = [];
  }

  // A successful start (or resume) switches to that guest.
  useEffect(() => {
    if (state.guest && lastHandled.current !== state) {
      lastHandled.current = state;
      releasePreviews();
      setGuest(state.guest);
      setShots([]);
      setSent(Boolean(state.guest.linkSentAt));
    }
  }, [state]);

  // Free preview memory when the screen closes.
  useEffect(() => releasePreviews, []);

  const update = (id: string, patch: Partial<Shot>) =>
    setShots((all) => all.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  async function uploadOne(file: File, current: CaptureGuest) {
    const id = crypto.randomUUID();
    setShots((all) => [...all, { id, previewUrl: "", name: file.name, status: "processing" }]);
    try {
      const photo = await processImage(file);
      previewUrls.current.push(photo.previewUrl);
      update(id, { previewUrl: photo.previewUrl, status: "uploading" });

      const paths = photoPaths(organizationId, eventId, current.id, id);
      const bucket = createClient().storage.from("event-photos");
      const options = { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" };
      const [full, thumb] = await Promise.all([bucket.upload(paths.full, photo.full, options), bucket.upload(paths.thumb, photo.thumb, options)]);
      if (full.error || thumb.error) throw new Error("Upload failed. Check the connection and try again.");

      const saved = await savePhoto(eventId, { guestId: current.id, photoId: id, width: photo.width, height: photo.height });
      if (!saved.ok) throw new Error(saved.error);
      update(id, { status: "done" });
    } catch (e) {
      update(id, { status: "error", error: (e as Error).message });
    }
  }

  async function handleFiles(list: FileList | null) {
    if (!guest || !list?.length) return;
    const current = guest;
    // Upload a couple at a time so a phone on venue Wi-Fi doesn't choke:
    // each worker takes the next file when it finishes the last.
    const queue = [...list];
    const worker = async (): Promise<void> => {
      const file = queue.shift();
      if (!file) return;
      await uploadOne(file, current);
      return worker();
    };
    await Promise.all(Array.from({ length: Math.min(UPLOADS_AT_ONCE, queue.length) }, worker));
  }

  function nextGuest() {
    releasePreviews();
    setGuest(null);
    setShots([]);
    setSent(false);
    setCopied(false);
    formRef.current?.reset();
    router.refresh();
  }

  const doneCount = shots.filter((s) => s.status === "done").length;
  const busy = shots.some((s) => s.status === "processing" || s.status === "uploading");
  const totalPhotos = (guest?.photoCount ?? 0) + doneCount;
  const link = guest ? galleryUrl(siteUrl, guest.accessToken) : "";
  const message = guest ? whatsappMessage({ guestName: guest.name, coupleNames, url: link, expiresAt: galleryExpiresAt }) : "";

  if (!guest) {
    return (
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
          <p className="text-xs font-semibold uppercase tracking-widest text-accent">Step 1</p>
          <h2 className="mt-1 font-display text-3xl italic">Who&apos;s at the backdrop?</h2>
          <form ref={formRef} action={formAction} className="mt-6 flex flex-col gap-4" noValidate>
            <Field
              label="Guest's WhatsApp number"
              name="phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder="98123 45678"
              required
              defaultValue={state.values?.phone}
              error={state.fieldErrors?.phone}
              hint="Indian numbers can skip +91."
              autoFocus
            />
            <Field label="Name (optional)" name="name" maxLength={120} placeholder="Asha" defaultValue={state.values?.name} error={state.fieldErrors?.name} />
            <label className="flex items-start gap-3 rounded-xl bg-line/40 p-3 text-sm">
              <input type="checkbox" name="consent" className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ink)]" />
              <span>
                The guest agrees to get their photos on WhatsApp, and for us to keep them until{" "}
                {new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }).format(new Date(galleryExpiresAt))}.
                {state.fieldErrors?.consent ? <span className="mt-1 block text-xs text-danger">{state.fieldErrors.consent}</span> : null}
              </span>
            </label>
            {state.error ? (
              <p role="alert" className="rounded-lg bg-danger/10 px-3 py-2 text-sm text-danger">
                {state.error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={starting}
              className="rounded-full bg-ink px-6 py-3.5 text-base font-semibold text-paper transition hover:opacity-90 disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start shooting"}
            </button>
          </form>
        </section>

        <aside className="rounded-3xl border border-line bg-surface p-6">
          <h3 className="font-semibold">Recent guests</h3>
          {recentGuests.length === 0 ? (
            <p className="mt-2 text-sm text-muted">Nobody yet. The first guest will show up here.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line">
              {recentGuests.map((g) => (
                <li key={g.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setGuest(g);
                      setShots([]);
                      setSent(Boolean(g.linkSentAt));
                    }}
                    className="flex w-full items-center justify-between gap-3 py-2.5 text-left text-sm hover:text-accent"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{g.name ?? formatPhone(g.phone)}</span>
                      <span className="block text-xs text-muted">
                        {g.code} · {g.photoCount} photo{g.photoCount === 1 ? "" : "s"}
                        {g.linkSentAt ? " · sent" : ""}
                      </span>
                    </span>
                    <span aria-hidden className="text-muted">
                      →
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-line bg-surface p-5 sm:p-6">
        <div className="flex items-center gap-4">
          <span className="rounded-2xl bg-ink px-4 py-2 font-mono text-2xl font-semibold text-paper" aria-label={`Guest code ${guest.code}`}>
            {guest.code}
          </span>
          <div>
            <p className="font-semibold">{guest.name ?? "Guest"}</p>
            <p className="text-sm text-muted">
              {formatPhone(guest.phone)} · {totalPhotos} photo{totalPhotos === 1 ? "" : "s"}
            </p>
          </div>
        </div>
        <button type="button" onClick={nextGuest} className="rounded-full border border-line px-4 py-2 text-sm font-medium hover:border-ink">
          Next guest
        </button>
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Step 2</p>
        <h2 className="mt-1 font-display text-3xl italic">Take or add photos</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => cameraInput.current?.click()}
            className="rounded-2xl bg-ink px-6 py-5 text-base font-semibold text-paper transition hover:opacity-90"
          >
            📷 Take photo
          </button>
          <button
            type="button"
            onClick={() => filesInput.current?.click()}
            className="rounded-2xl border border-line px-6 py-5 text-base font-semibold transition hover:border-ink"
          >
            Add from gallery or SLR
          </button>
        </div>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          aria-label="Take photo"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={filesInput}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          aria-label="Add photos"
          data-testid="add-photos"
          onChange={(e) => {
            void handleFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p className="mt-3 text-xs text-muted">
          SLR: copy the card to this laptop or use the camera&apos;s Wi-Fi app, then add the guest&apos;s shots. Photos are resized and location data is removed before upload.
        </p>

        {shots.length ? (
          <ul className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
            {shots.map((shot) => (
              <li key={shot.id} className="flex flex-col items-center gap-2 text-center">
                <div className="relative w-full max-w-[11rem]">
                  <PolaroidCard
                    uid={`shot-${shot.id}`}
                    template={design.template}
                    palette={design.palette}
                    text={design.text}
                    filterId={design.filterId}
                    photoHref={shot.previewUrl || null}
                    className={`w-full shadow-md transition ${shot.status === "done" ? "" : "opacity-60"}`}
                  />
                  {shot.status === "processing" || shot.status === "uploading" ? (
                    <span className="absolute inset-0 flex items-center justify-center">
                      <span className="h-8 w-8 animate-spin rounded-full border-2 border-ink/20 border-t-ink" aria-hidden />
                    </span>
                  ) : null}
                </div>
                <p className={`text-xs ${shot.status === "error" ? "text-danger" : "text-muted"}`}>
                  {shot.status === "processing" && "Preparing…"}
                  {shot.status === "uploading" && "Uploading…"}
                  {shot.status === "done" && "Saved ✓"}
                  {shot.status === "error" && shot.error}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="rounded-3xl border border-line bg-surface p-6 sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Step 3</p>
        <h2 className="mt-1 font-display text-3xl italic">Send their link</h2>
        <p className="mt-2 text-sm text-muted">
          Opens WhatsApp with the message ready. Tap send, and you&apos;re done.
          {busy ? " Wait for uploads to finish first." : ""}
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a
            href={totalPhotos > 0 && !busy ? whatsappLink(guest.phone, message) : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={totalPhotos === 0 || busy}
            onClick={(e) => {
              if (totalPhotos === 0 || busy) {
                e.preventDefault();
                return;
              }
              setSent(true);
              startTransition(() => markLinkSent(eventId, guest.id));
            }}
            className="rounded-full bg-[#25D366] px-6 py-3 text-sm font-semibold text-[#073b1d] transition hover:opacity-90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            Send on WhatsApp
          </a>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(link);
              setCopied(true);
            }}
            className="rounded-full border border-line px-5 py-3 text-sm font-semibold hover:border-ink"
          >
            {copied ? "Link copied" : "Copy link"}
          </button>
          {sent ? (
            <button type="button" onClick={nextGuest} className="rounded-full border border-ink px-5 py-3 text-sm font-semibold">
              Next guest →
            </button>
          ) : null}
        </div>
        <label className="mt-5 flex flex-col gap-1.5 text-xs text-muted">
          Gallery link
          <input readOnly value={link} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.target.select()} data-testid="gallery-link" />
        </label>
        {sent ? <p className="mt-3 text-sm text-success">Link sent ✓</p> : null}
      </section>
    </div>
  );
}
