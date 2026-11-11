"use client";

import { useState, useTransition } from "react";
import { FormMessage, type FormState } from "@/components/ui/form";
import { formatIstDate } from "@/lib/events/time";
import type { ProjectStatus } from "@/lib/projects/queries";
import { whatsappShareLink } from "@/lib/projects/share";
import { deleteProject, setProjectStatus } from "../actions";

type Share = { url: string; message: string; qrSvg: string; expiresAt: string };

type Props = {
  projectId: string;
  status: ProjectStatus;
  canManage: boolean;
  visiblePhotos: number;
  everShared: boolean;
  expired: boolean;
  share: Share | null;
};

const button = "rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60";
const primary = `${button} bg-ink text-paper hover:opacity-90`;
const secondary = `${button} border border-line bg-surface hover:border-ink`;
const danger = `${button} border border-danger/40 text-danger hover:bg-danger/10`;

export function ProjectControls({ projectId, status, canManage, visiblePhotos, everShared, expired, share }: Readonly<Props>) {
  const [state, setState] = useState<FormState>({ error: null });
  const [pending, startTransition] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const run = (fn: () => Promise<FormState>) =>
    startTransition(async () => {
      setState(await fn());
    });
  const change = (to: ProjectStatus) => run(() => setProjectStatus(projectId, to));

  return (
    <section aria-label="Sharing" className="rounded-2xl border border-line bg-surface p-6">
      {share ? (
        <SharePanel share={share} />
      ) : status === "draft" ? (
        <div>
          <h2 className="text-lg font-semibold">{everShared ? "Not shared right now" : "Ready to share?"}</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Publishing makes one private link for this project. Everyone with it sees the photos you haven&apos;t hidden, and can save
            them. You can keep adding photos after.
          </p>
        </div>
      ) : status === "archived" ? (
        <div>
          <h2 className="text-lg font-semibold">Archived</h2>
          <p className="mt-1 text-sm text-muted">The link doesn&apos;t work while a project is archived.</p>
        </div>
      ) : (
        <div>
          <h2 className="text-lg font-semibold">The link has expired</h2>
          <p className="mt-1 text-sm text-muted">The gallery&apos;s sharing period on your plan is over, so guests can no longer open it.</p>
        </div>
      )}

      {canManage ? (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {status === "draft" ? (
            <button type="button" className={primary} disabled={pending || visiblePhotos === 0} onClick={() => change("published")}>
              {pending ? "Working…" : everShared ? "Share again" : "Publish link"}
            </button>
          ) : null}
          {status === "published" ? (
            <button type="button" className={secondary} disabled={pending} onClick={() => change("draft")}>
              Stop sharing
            </button>
          ) : null}
          {status !== "archived" && (everShared || expired) ? (
            <button type="button" className={secondary} disabled={pending} onClick={() => change("archived")}>
              Archive
            </button>
          ) : null}
          {status === "archived" ? (
            <button type="button" className={secondary} disabled={pending} onClick={() => change("draft")}>
              Restore
            </button>
          ) : null}
          {status === "draft" && !everShared ? (
            confirmDelete ? (
              <span className="flex flex-wrap items-center gap-2 text-sm">
                Delete the project and its photos?
                <button type="button" className={danger} disabled={pending} onClick={() => run(() => deleteProject(projectId))}>
                  Yes, delete
                </button>
                <button type="button" className={secondary} disabled={pending} onClick={() => setConfirmDelete(false)}>
                  Keep it
                </button>
              </span>
            ) : (
              <button type="button" className={danger} disabled={pending} onClick={() => setConfirmDelete(true)}>
                Delete project
              </button>
            )
          ) : null}
          {status === "draft" && visiblePhotos === 0 ? <span className="text-sm text-muted">Add a photo to publish.</span> : null}
        </div>
      ) : null}

      <div className="mt-4" aria-live="polite">
        <FormMessage state={state} />
      </div>
    </section>
  );
}

function SharePanel({ share }: Readonly<{ share: Share }>) {
  const [copied, setCopied] = useState<"link" | "message" | null>(null);
  const qrHref = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(share.qrSvg)}`;

  async function copy(text: string, what: "link" | "message") {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <div className="grid gap-6 sm:grid-cols-[1fr_auto]">
      <div className="min-w-0">
        <h2 className="text-lg font-semibold">Shared with a private link</h2>
        <p className="mt-1 text-sm text-muted">Open until {formatIstDate(share.expiresAt)}. Only people with the link can see the photos.</p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
          <code className="min-w-0 flex-1 truncate text-sm">{share.url}</code>
          <button type="button" onClick={() => copy(share.url, "link")} className="shrink-0 rounded-full px-3 py-1 text-sm font-semibold hover:bg-line/60">
            {copied === "link" ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <a href={whatsappShareLink(share.message)} target="_blank" rel="noopener noreferrer" className="rounded-full bg-[#1f7a4d] px-5 py-2.5 text-sm font-semibold text-white hover:opacity-90">
            Send on WhatsApp
          </a>
          <button type="button" onClick={() => copy(share.message, "message")} className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:border-ink">
            {copied === "message" ? "Message copied" : "Copy message"}
          </button>
          <a href={share.url} target="_blank" rel="noopener noreferrer" className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:border-ink">
            Open gallery
          </a>
        </div>
      </div>
      <figure className="flex flex-col items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- inline QR code */}
        <img src={qrHref} alt="QR code for the gallery link" width={144} height={144} className="rounded-lg border border-line bg-white p-1" />
        <a href={qrHref} download="gallery-qr.svg" className="text-xs font-medium text-muted underline-offset-4 hover:text-ink hover:underline">
          Download QR
        </a>
      </figure>
    </div>
  );
}
