"use client";
import { useEffect, useMemo } from "react";

/** Object URLs for blobs, made during render and revoked when the inputs change or the component leaves. */
export function useObjectUrls<T extends { id: string }>(items: T[] | null, pick: (t: T) => Blob): Record<string, string> {
  const urls = useMemo(() => {
    const made: Record<string, string> = {};
    if (items) for (const t of items) made[t.id] = URL.createObjectURL(pick(t));
    return made;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);
  useEffect(() => () => { Object.values(urls).forEach(URL.revokeObjectURL); }, [urls]);
  return urls;
}

export function useObjectUrl(blob: Blob | null | undefined, key: string | null | undefined): string | null {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const url = useMemo(() => (blob ? URL.createObjectURL(blob) : null), [key]);
  useEffect(() => () => { if (url) URL.revokeObjectURL(url); }, [url]);
  return url;
}
