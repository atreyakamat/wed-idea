"use client";

import { useRef, useState, useTransition } from "react";
import { FormMessage, type FormState } from "@/components/ui/form";
import { createClient } from "@/lib/supabase/client";
import { setStudioLogo } from "./actions";

const MAX_BYTES = 2 * 1024 * 1024;
const MAX_EDGE = 800;

/** Shrinks the logo to at most 800 px and saves it as PNG (keeps transparency). */
async function preparePng(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Couldn't read that image."))), "image/png"));
}

export function LogoForm({ studioId, logoUrl }: Readonly<{ studioId: string; logoUrl: string | null }>) {
  const [state, setState] = useState<FormState>({ error: null });
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function upload(file: File | undefined) {
    if (!file) return;
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
      setState({ error: "Use a PNG, JPEG or WebP image. A PNG with a transparent background looks best." });
      return;
    }
    if (file.size > 10 * MAX_BYTES) {
      setState({ error: "That image is very large. Use one under 20 MB." });
      return;
    }
    startTransition(async () => {
      try {
        const png = await preparePng(file);
        if (png.size > MAX_BYTES) throw new Error("The logo is still over 2 MB after resizing. Try a simpler image.");
        const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
        const path = `${studioId}/logo-${id}.png`;
        const { error } = await createClient().storage.from("studio-assets").upload(path, png, { contentType: "image/png", upsert: false });
        if (error) throw new Error("Couldn't upload the logo. Try again.");
        setState(await setStudioLogo(path));
      } catch (e) {
        setState({ error: (e as Error).message });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-5">
        <div className="flex h-24 w-56 items-center justify-center rounded-2xl border border-dashed border-line bg-paper p-3">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- public studio logo
            <img src={logoUrl} alt="Your logo" className="max-h-full max-w-full object-contain" />
          ) : (
            <span className="text-sm text-muted">No logo yet</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={pending} onClick={() => input.current?.click()} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-60">
            {pending ? "Uploading…" : logoUrl ? "Change logo" : "Upload logo"}
          </button>
          {logoUrl ? (
            <button type="button" disabled={pending} onClick={() => startTransition(async () => setState(await setStudioLogo(null)))} className="rounded-full border border-line px-5 py-2.5 text-sm font-semibold hover:border-ink disabled:opacity-60">
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        id="studio-logo"
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <FormMessage state={state} />
    </div>
  );
}
