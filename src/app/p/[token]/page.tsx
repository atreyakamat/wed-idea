import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatIstDate } from "@/lib/events/time";
import { getProjectGallery } from "@/lib/projects/gallery";
import { GalleryView } from "./gallery-view";

// The link is the key to the photos: keep it out of search engines and never
// send it to other sites in the Referer header.
export const metadata: Metadata = {
  title: "Your photos",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function ProjectGalleryPage({ params }: PageProps<"/p/[token]">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<GallerySkeleton />}>
        <Gallery params={params} />
      </Suspense>
    </main>
  );
}

async function Gallery({ params }: Readonly<{ params: PageProps<"/p/[token]">["params"] }>) {
  await connection();
  const { token } = await params;
  const gallery = await getProjectGallery(token);

  if (gallery.state === "not-found") notFound();

  if (gallery.state === "expired") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <p className="font-display text-lg italic text-accent">{gallery.studioName}</p>
        <h1 className="mt-3 font-display text-4xl italic">These photos have gone</h1>
        <p className="mt-4 text-muted">
          Photos from {gallery.projectName} were available until {formatIstDate(gallery.expiredAt)}. Ask {gallery.studioName} if you
          still need them.
        </p>
      </div>
    );
  }

  const date = gallery.shootDate ? formatIstDate(`${gallery.shootDate}T12:00:00+05:30`) : null;
  return (
    <div className="px-4 sm:px-6" style={{ paddingLeft: "max(16px, env(safe-area-inset-left))", paddingRight: "max(16px, env(safe-area-inset-right))" }}>
      <header className="mx-auto flex max-w-6xl flex-col items-center pt-8 text-center sm:pt-12">
        {gallery.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- studio logo from public storage
          <img src={gallery.logoUrl} alt={gallery.studioName} className="h-12 w-auto max-w-[220px] object-contain sm:h-14" />
        ) : (
          <p className="font-display text-xl italic text-accent">{gallery.studioName}</p>
        )}
        {gallery.cover ? (
          <div
            className="relative mt-6 w-full overflow-hidden rounded-2xl sm:mt-8 sm:rounded-3xl"
            style={{ aspectRatio: gallery.cover.width >= gallery.cover.height ? "16 / 9" : "4 / 5", maxHeight: "70vh", backgroundColor: gallery.cover.tone ?? "var(--line)" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- signed storage URL */}
            <img src={gallery.cover.fullUrl} alt="" className="absolute inset-0 h-full w-full object-cover" fetchPriority="high" />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent px-5 pb-6 pt-24 text-left text-white sm:px-10 sm:pb-10">
              <h1 className="font-display text-4xl italic leading-tight sm:text-6xl">{gallery.projectName}</h1>
              <p className="mt-2 text-sm text-white/85 sm:text-base">
                {gallery.photoCount} photo{gallery.photoCount === 1 ? "" : "s"}
                {date ? ` · ${date}` : ""}
              </p>
            </div>
          </div>
        ) : (
          <h1 className="mt-4 font-display text-4xl italic sm:text-5xl">{gallery.projectName}</h1>
        )}
        <p className="mt-5 max-w-md text-sm text-muted">
          Tap a photo to see it full size. ❤ the ones you love, and save any to your phone. Available until {formatIstDate(gallery.expiresAt)}.
        </p>
      </header>

      <div className="mt-6">
        <GalleryView token={token} projectName={gallery.projectName} initial={{ photos: gallery.photos, hasMore: gallery.hasMore }} total={gallery.photoCount} />
      </div>

      <footer className="mx-auto mt-10 max-w-6xl pb-12 text-center text-xs text-muted">
        Only people with this link can see these photos.
        {gallery.showBranding ? (
          <>
            {" "}
            Delivered with{" "}
            <Link href="/" className="font-display italic underline-offset-4 hover:underline">
              Cute Wedding Polaroid
            </Link>
          </>
        ) : null}
      </footer>
    </div>
  );
}

function GallerySkeleton() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-16" aria-hidden>
      <div className="mx-auto h-10 w-64 animate-pulse rounded-xl bg-line/60" />
      <div className="mt-12 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="aspect-[4/3] animate-pulse rounded-lg bg-line/60" />
        ))}
      </div>
    </div>
  );
}
