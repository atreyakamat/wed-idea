import Link from "next/link";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/lib/brand";

export function SiteHeader() {
  return (
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-6">
      <Link href="/" className="font-display text-xl italic">
        {BRAND_NAME}
      </Link>
      <nav aria-label="Site" className="flex items-center gap-4 text-sm text-muted sm:gap-6">
        <Link href="/#how" className="hidden hover:text-ink sm:inline">
          How it works
        </Link>
        <Link href="/pricing" className="hover:text-ink">
          Pricing
        </Link>
        <Link href="/login" className="hover:text-ink">
          Sign in
        </Link>
        <Link href="/signup" className="hidden rounded-full bg-ink px-4 py-2 font-semibold text-paper hover:opacity-90 sm:inline">
          Start free
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-6 py-10 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
        <span>
          <span className="font-display italic text-ink">{BRAND_NAME}</span> · Made in Goa, India
        </span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2">
          <Link href="/pricing" className="hover:text-ink">
            Pricing
          </Link>
          <Link href="/templates" className="hover:text-ink">
            Polaroid styles
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          {SUPPORT_EMAIL ? (
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-ink">
              {SUPPORT_EMAIL}
            </a>
          ) : null}
        </nav>
      </div>
    </footer>
  );
}
