"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { processImage } from "@/lib/capture/process-image";
import { EXIF_SCAN_BYTES, readTakenAt } from "@/lib/projects/exif";
import { isPhotoFile, needsPcApp, PROJECT_BUCKET, projectFileName, projectPhotoPaths } from "@/lib/projects/paths";
import { createClient } from "@/lib/supabase/client";
import { discardUpload, saveProjectPhoto } from "../actions";

type Props = {
  projectId: string;
  organizationId: string;
  /** File names already in the project; dropping them again does nothing. */
  existingNames: string[];
  /** Photos the plan still allows in this project, or null if unknown. */
  remaining: number | null;
};

type Item = { file: File; name: string };
type Failure = Item & { error: string };

type Run = {
  total: number;
  done: number;
  failed: Failure[];
  skipped: { duplicates: number; heic: number; overLimit: number; notPhotos: number };
  stopped: string | null;
  running: boolean;
};

const UPLOADS_AT_ONCE = 3;
const UPLOAD_OPTIONS = { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" };

/** Every file in a dropped folder (or files), with its path inside the drop. */
async function filesFromDrop(items: DataTransferItemList): Promise<Item[]> {
  const entries = [...items].map((i) => i.webkitGetAsEntry?.()).filter((e): e is FileSystemEntry => Boolean(e));
  const out: Item[] = [];

  async function walk(entry: FileSystemEntry, path: string): Promise<void> {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => (entry as FileSystemFileEntry).file(resolve, reject));
      out.push({ file, name: path });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    // readEntries returns at most ~100 entries per call: keep reading.
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => reader.readEntries(resolve, reject));
      if (!batch.length) break;
      for (const child of batch) await walk(child, `${path}/${child.name}`);
    }
  }

  for (const entry of entries) await walk(entry, entry.name);
  return out;
}

async function takenAt(file: File): Promise<string | null> {
  if (!/\.jpe?g$/i.test(file.name)) return null;
  try {
    return readTakenAt(await file.slice(0, EXIF_SCAN_BYTES).arrayBuffer());
  } catch {
    return null;
  }
}

export function FolderUploader({ projectId, organizationId, existingNames, remaining }: Readonly<Props>) {
  const router = useRouter();
  const [run, setRun] = useState<Run | null>(null);
  const [dragging, setDragging] = useState(false);
  const known = useRef(new Set(existingNames));
  const stop = useRef<string | null>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const filesInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    for (const n of existingNames) known.current.add(n);
  }, [existingNames]);

  // Leaving mid-upload loses the rest: ask first.
  useEffect(() => {
    if (!run?.running) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [run?.running]);

  async function uploadOne(item: Item): Promise<string | null> {
    const photoId = crypto.randomUUID();
    let stored = false;
    try {
      const [photo, taken] = await Promise.all([processImage(item.file), takenAt(item.file)]);
      URL.revokeObjectURL(photo.previewUrl);
      const paths = projectPhotoPaths(organizationId, projectId, photoId);
      const bucket = createClient().storage.from(PROJECT_BUCKET);
      const [full, thumb] = await Promise.all([bucket.upload(paths.full, photo.full, UPLOAD_OPTIONS), bucket.upload(paths.thumb, photo.thumb, UPLOAD_OPTIONS)]);
      stored = !full.error || !thumb.error;
      if (full.error || thumb.error) throw new Error("Upload failed. Check the connection and retry.");

      const saved = await saveProjectPhoto(projectId, {
        photoId,
        fileName: item.name,
        width: photo.width,
        height: photo.height,
        bytes: item.file.size,
        takenAt: taken ?? (item.file.lastModified ? new Date(item.file.lastModified).toISOString() : null),
      });
      if (!saved.ok) {
        // A plan or access refusal applies to every file left: stop the run.
        if (saved.status === 403) stop.current = saved.error;
        throw new Error(saved.error);
      }
      known.current.add(item.name);
      return null;
    } catch (e) {
      if (stored) void discardUpload(projectId, photoId).catch(() => undefined);
      return (e as Error).message;
    }
  }

  async function start(items: Item[], isRetry = false) {
    if (run?.running || !items.length) return;
    stop.current = null;
    const skipped = { duplicates: 0, heic: 0, overLimit: 0, notPhotos: 0 };
    const queue: Item[] = [];
    const seen = new Set<string>();
    for (const item of items) {
      if (!isPhotoFile(item.name)) skipped.notPhotos++;
      else if (needsPcApp(item.name)) skipped.heic++;
      else if (known.current.has(item.name) || seen.has(item.name)) skipped.duplicates++;
      else {
        seen.add(item.name);
        queue.push(item);
      }
    }
    if (remaining !== null && !isRetry) {
      if (queue.length > remaining) {
        skipped.overLimit = queue.length - remaining;
        queue.length = remaining;
      }
    }

    setRun({ total: queue.length, done: 0, failed: [], skipped, stopped: null, running: queue.length > 0 });
    if (!queue.length) return;

    const failed: Failure[] = [];
    const worker = async (): Promise<void> => {
      for (;;) {
        if (stop.current) return;
        const item = queue.shift();
        if (!item) return;
        const error = await uploadOne(item);
        if (error) failed.push({ ...item, error });
        setRun((r) => (r ? { ...r, done: r.done + (error ? 0 : 1), failed: [...failed] } : r));
      }
    };
    await Promise.all(Array.from({ length: Math.min(UPLOADS_AT_ONCE, queue.length) }, worker));
    setRun((r) => (r ? { ...r, running: false, stopped: stop.current } : r));
    router.refresh();
  }

  function fromInput(list: FileList | null) {
    if (!list) return;
    // Folder picks carry "Folder/sub/IMG.jpg"; single picks just "IMG.jpg".
    void start([...list].map((file) => ({ file, name: projectFileName(file.webkitRelativePath || file.name) })));
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const items = await filesFromDrop(e.dataTransfer.items);
    void start(items.map((i) => ({ file: i.file, name: projectFileName(i.name) })));
  }

  const busy = Boolean(run?.running);
  const progress = run && run.total ? Math.round(((run.done + run.failed.length) / run.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={busy ? (e) => e.preventDefault() : onDrop}
        className={`flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition ${dragging ? "border-ink bg-line/40" : "border-line bg-surface"}`}
      >
        <p className="font-display text-2xl italic">Drop the shoot&apos;s folder here</p>
        <p className="max-w-md text-sm text-muted">
          JPEG, PNG or WebP. Photos are resized for the web (2400 px) and location data is removed. Already-uploaded files are skipped,
          so you can drop the same folder again after adding more.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          <button type="button" disabled={busy} onClick={() => folderInput.current?.click()} className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90 disabled:opacity-60">
            Choose folder
          </button>
          <button type="button" disabled={busy} onClick={() => filesInput.current?.click()} className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:border-ink disabled:opacity-60">
            Choose photos
          </button>
        </div>
        <input
          ref={folderInput}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          // @ts-expect-error -- non-standard but supported by every current browser
          webkitdirectory=""
          multiple
          onChange={(e) => {
            fromInput(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={filesInput}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => {
            fromInput(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {run ? (
        <div className="rounded-2xl border border-line bg-surface p-4 text-sm" aria-live="polite">
          {run.total ? (
            <>
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium">
                  {run.running ? "Uploading" : "Uploaded"} {run.done} of {run.total}
                  {run.failed.length ? ` · ${run.failed.length} failed` : ""}
                </span>
                <span className="tabular-nums text-muted">{progress}%</span>
              </div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-label="Upload progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
                <div className="h-full rounded-full bg-ink transition-[width]" style={{ width: `${progress}%` }} />
              </div>
              {run.running ? <p className="mt-2 text-xs text-muted">Keep this tab open until it finishes.</p> : null}
            </>
          ) : (
            <p className="font-medium">Nothing new to upload.</p>
          )}
          <SkipNotes skipped={run.skipped} />
          {run.stopped ? (
            <p role="alert" className="mt-3 rounded-lg bg-danger/10 px-3 py-2 text-danger">
              {run.stopped}
            </p>
          ) : null}
          {!run.running && run.failed.length ? (
            <div className="mt-3">
              <ul className="max-h-32 overflow-auto text-xs text-danger">
                {run.failed.slice(0, 50).map((f) => (
                  <li key={f.name}>
                    {f.name}: {f.error}
                  </li>
                ))}
              </ul>
              {!run.stopped ? (
                <button type="button" onClick={() => void start(run.failed, true)} className="mt-2 rounded-full border border-line px-4 py-2 font-semibold hover:border-ink">
                  Retry {run.failed.length} failed
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function SkipNotes({ skipped }: Readonly<{ skipped: Run["skipped"] }>) {
  const notes = [
    skipped.duplicates ? `${skipped.duplicates} already in this project` : null,
    skipped.heic ? `${skipped.heic} HEIC photo${skipped.heic === 1 ? "" : "s"} skipped (the PC app handles HEIC)` : null,
    skipped.overLimit ? `${skipped.overLimit} over your plan's photo limit, not uploaded` : null,
    skipped.notPhotos ? `${skipped.notPhotos} non-photo file${skipped.notPhotos === 1 ? "" : "s"} ignored` : null,
  ].filter(Boolean);
  if (!notes.length) return null;
  return <p className="mt-2 text-xs text-muted">{notes.join(" · ")}</p>;
}
