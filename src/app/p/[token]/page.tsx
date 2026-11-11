import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { formatIstDate } from "@/lib/events/time";
import { getProjectGallery } from "@/lib/projects/gallery";
import { ProjectGalleryGrid } from "./gallery-grid";

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

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <header className="text-center">
        <p className="font-display text-lg italic text-accent">{gallery.studioName}</p>
        <h1 className="mt-2 font-display text-4xl italic sm:text-5xl">{gallery.projectName}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">
          {gallery.photoCount} photo{gallery.photoCount === 1 ? "" : "s"}
          {gallery.shootDate ? ` · ${formatIstDate(`${gallery.shootDate}T12:00:00+05:30`)}` : ""}. Tap one to see it full size and save it.
        </p>
        <p className="mt-4 inline-block rounded-full bg-line/70 px-4 py-1.5 text-xs font-medium text-muted">
          Available until {formatIstDate(gallery.expiresAt)}
        </p>
      </header>

      <div className="mt-10">
        <ProjectGalleryGrid token={token} initial={{ photos: gallery.photos, hasMore: gallery.hasMore }} total={gallery.photoCount} />
      </div>

      <footer className="mt-16 text-center text-xs text-muted">
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
