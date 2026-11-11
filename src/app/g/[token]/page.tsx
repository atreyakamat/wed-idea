import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { themeForEvent } from "@/lib/events/design";
import { formatIstDate } from "@/lib/events/time";
import { getGuestGallery } from "@/lib/gallery/queries";
import { slugify } from "@/lib/domain/slug";
import { resolveTheme } from "@/lib/polaroid/theme";
import { GuestGallery } from "./guest-gallery";

// The link itself is the key to someone's photos: keep it out of search
// engines and never send it to other sites in the Referer header.
export const metadata: Metadata = {
  title: "Your polaroids",
  robots: { index: false, follow: false, nocache: true },
  referrer: "no-referrer",
};

export default function GalleryPage({ params }: PageProps<"/g/[token]">) {
  return (
    <main className="flex-1">
      <Suspense fallback={<GallerySkeleton />}>
        <Gallery params={params} />
      </Suspense>
    </main>
  );
}

function photoCountLine(count: number): string {
  if (count === 0) return "Your photos will appear here as soon as they're taken.";
  return `${count} photo${count === 1 ? "" : "s"} from the backdrop. Tap one to save it.`;
}

async function Gallery({ params }: Readonly<{ params: PageProps<"/g/[token]">["params"] }>) {
  await connection();
  const { token } = await params;
  const gallery = await getGuestGallery(token);

  if (gallery.state === "not-found") notFound();

  if (gallery.state === "expired") {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-6 py-24 text-center">
        <p className="font-display text-lg italic text-accent">{gallery.coupleNames}</p>
        <h1 className="mt-3 font-display text-4xl italic">These polaroids have gone</h1>
        <p className="mt-4 text-muted">
          Photos from this wedding were available until {formatIstDate(gallery.expiredAt)} and are no longer available, to keep
          everyone&apos;s photos private.
        </p>
      </div>
    );
  }

  const { template, palette, text, filterId } = resolveTheme(
    themeForEvent({ couple_names: gallery.coupleNames, starts_at: gallery.startsAt, venue: gallery.venue, theme: gallery.theme }),
  );
  const firstName = gallery.guestName?.trim().split(/\s+/)[0];
  const count = gallery.photos.length;

  return (
    <div className="mx-auto max-w-5xl px-5 py-12 sm:px-6 sm:py-16">
      <header className="text-center">
        <p className="font-display text-lg italic text-accent">{gallery.coupleNames}</p>
        <h1 className="mt-2 font-display text-4xl italic sm:text-5xl">{firstName ? `${firstName}, your polaroids` : "Your polaroids"}</h1>
        <p className="mx-auto mt-3 max-w-md text-muted">{photoCountLine(count)}</p>
        <p className="mt-4 inline-block rounded-full bg-line/70 px-4 py-1.5 text-xs font-medium text-muted">
          Available until {formatIstDate(gallery.expiresAt)}
        </p>
      </header>

      {count ? (
        <div className="mt-12">
          <GuestGallery photos={gallery.photos} design={{ template, palette, text, filterId }} fileStem={slugify(gallery.coupleNames) || "polaroid"} />
        </div>
      ) : null}

      <footer className="mt-16 text-center text-xs text-muted">
        Only people with this link can see these photos.
        {gallery.showBranding ? (
          <>
            {" "}
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
    <div className="mx-auto max-w-5xl px-5 py-16" aria-hidden>
      <div className="mx-auto h-10 w-64 animate-pulse rounded-xl bg-line/60" />
      <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="aspect-[54/86] animate-pulse rounded bg-line/60" />
        ))}
      </div>
    </div>
  );
}
