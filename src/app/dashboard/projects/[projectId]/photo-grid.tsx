"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { FormMessage, type FormState } from "@/components/ui/form";
import type { ProjectPhoto } from "@/lib/projects/queries";
import { deletePhotos, loadProjectPhotos, setPhotosHidden } from "../actions";

type Props = {
  projectId: string;
  initial: { photos: ProjectPhoto[]; hasMore: boolean };
  canDelete: boolean;
};

export function PhotoGrid({ projectId, initial, canDelete }: Readonly<Props>) {
  const [photos, setPhotos] = useState(initial.photos);
  const [hasMore, setHasMore] = useState(initial.hasMore);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [state, setState] = useState<FormState>({ error: null });
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const [viewing, setViewing] = useState<ProjectPhoto | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A click on the dimmed area around the photo closes it (Escape does too).
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const onBackdrop = (e: MouseEvent) => {
      if (e.target === dialog) dialog.close();
    };
    dialog.addEventListener("click", onBackdrop);
    return () => dialog.removeEventListener("click", onBackdrop);
  }, [photos.length]);

  if (!photos.length) return null;

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const ids = [...selected];

  function hide(hidden: boolean) {
    startTransition(async () => {
      const result = await setPhotosHidden(projectId, ids, hidden);
      setState(result);
      if (!result.error) {
        setPhotos((all) => all.map((p) => (selected.has(p.id) ? { ...p, hidden } : p)));
        setSelected(new Set());
      }
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await deletePhotos(projectId, ids);
      setState(result);
      setConfirmDelete(false);
      if (!result.error) {
        setPhotos((all) => all.filter((p) => !selected.has(p.id)));
        setSelected(new Set());
      }
    });
  }

  function more() {
    startTransition(async () => {
      const page = await loadProjectPhotos(projectId, photos.length);
      setPhotos((all) => [...all, ...page.photos.filter((p) => !all.some((a) => a.id === p.id))]);
      setHasMore(page.hasMore);
    });
  }

  function open(photo: ProjectPhoto) {
    setViewing(photo);
    dialogRef.current?.showModal();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="sticky top-0 z-10 -mx-1 flex min-h-11 flex-wrap items-center gap-2 bg-paper/90 px-1 py-1 backdrop-blur">
        {selected.size ? (
          <>
            <span className="text-sm font-medium">{selected.size} selected</span>
            <button type="button" disabled={pending} onClick={() => hide(true)} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-ink disabled:opacity-60">
              Hide from guests
            </button>
            <button type="button" disabled={pending} onClick={() => hide(false)} className="rounded-full border border-line bg-surface px-4 py-2 text-sm font-semibold hover:border-ink disabled:opacity-60">
              Show to guests
            </button>
            {canDelete ? (
              confirmDelete ? (
                <span className="flex items-center gap-2 text-sm">
                  Delete for good?
                  <button type="button" disabled={pending} onClick={remove} className="rounded-full border border-danger/40 px-4 py-2 font-semibold text-danger hover:bg-danger/10">
                    Delete {selected.size}
                  </button>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-full px-3 py-2 font-medium text-muted hover:text-ink">
                    Cancel
                  </button>
                </span>
              ) : (
                <button type="button" disabled={pending} onClick={() => setConfirmDelete(true)} className="rounded-full border border-danger/40 px-4 py-2 text-sm font-semibold text-danger hover:bg-danger/10">
                  Delete
                </button>
              )
            ) : null}
            <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-sm font-medium text-muted hover:text-ink">
              Clear
            </button>
          </>
        ) : (
          <span className="text-sm text-muted">Tick photos to hide them from guests{canDelete ? " or delete them" : ""}.</span>
        )}
      </div>

      <FormMessage state={state} />

      <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {photos.map((photo) => {
          const isSelected = selected.has(photo.id);
          return (
            <li key={photo.id} className={`group relative aspect-square overflow-hidden rounded-lg bg-line/50 ${isSelected ? "ring-2 ring-ink ring-offset-2 ring-offset-paper" : ""}`}>
              <button type="button" onClick={() => open(photo)} className="block h-full w-full" aria-label={`View ${photo.fileName}`}>
                {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
                <img src={photo.thumbUrl} alt="" loading="lazy" className={`h-full w-full object-cover transition ${photo.hidden ? "opacity-35 grayscale" : ""}`} />
              </button>
              <label className="absolute left-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-paper/90 shadow">
                <input type="checkbox" checked={isSelected} onChange={() => toggle(photo.id)} className="h-4 w-4 accent-ink" aria-label={`Select ${photo.fileName}`} />
              </label>
              {photo.hidden ? <span className="absolute bottom-1.5 left-1.5 rounded-full bg-ink/80 px-2 py-0.5 text-[11px] font-medium text-paper">Hidden</span> : null}
            </li>
          );
        })}
      </ul>

      {hasMore ? (
        <button type="button" onClick={more} disabled={pending} className="self-center rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:border-ink disabled:opacity-60">
          {pending ? "Loading…" : "Load more"}
        </button>
      ) : null}

      <dialog
        ref={dialogRef}
        onClose={() => setViewing(null)}
        className="m-auto max-h-[92dvh] max-w-[92vw] rounded-xl bg-[#171310] p-0 text-white backdrop:bg-black/70"
        aria-label={viewing?.fileName ?? "Photo"}
      >
        {viewing ? (
          <div className="flex flex-col">
            <div className="flex items-center justify-between gap-4 px-4 py-2 text-sm">
              <span className="truncate">{viewing.fileName}</span>
              <form method="dialog">
                <button type="submit" className="rounded-full px-3 py-1 hover:bg-white/10">
                  Close ✕
                </button>
              </form>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img src={viewing.fullUrl} alt={viewing.fileName} className="max-h-[82dvh] w-auto object-contain" />
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
