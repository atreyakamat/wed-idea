/** What a blob really is, decided by its first bytes rather than its name or declared type. */
export type MediaKind = { kind: "photo" | "video"; ext: "jpg" | "png" | "webp" | "mp4" | "webm"; type: string };

const MIME = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", mp4: "video/mp4", webm: "video/webm" } as const;

export function sniffBytes(b: Uint8Array): MediaKind["ext"] | null {
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "jpg";
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "png";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "webp";
  if (b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70) return "mp4";
  if (b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "webm";
  return null;
}

/**
 * Checks a file that came from outside Pixi (the phone's picker, another phone, a backup) and
 * returns it retyped from its real header, or null when it is not a picture or video we handle.
 */
export async function acceptMedia(blob: Blob, maxBytes = 200 * 1024 * 1024): Promise<{ blob: Blob } & MediaKind | null> {
  if (blob.size === 0 || blob.size > maxBytes) return null;
  const head = new Uint8Array(await blob.slice(0, 16).arrayBuffer());
  const ext = sniffBytes(head);
  if (!ext) return null;
  const type = MIME[ext];
  return { blob: blob.type === type ? blob : new Blob([blob], { type }), kind: ext === "mp4" || ext === "webm" ? "video" : "photo", ext, type };
}
