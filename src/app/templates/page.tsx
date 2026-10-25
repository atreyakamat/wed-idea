import type { Metadata } from "next";
import Link from "next/link";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import { SAMPLE_PHOTO, SAMPLE_TEXT } from "@/lib/polaroid/samples";
import { TEMPLATES } from "@/lib/polaroid/templates";
import { TemplatePlayground } from "./template-playground";

export const metadata: Metadata = {
  title: "Polaroid templates",
  description: "Mini polaroid templates (5.4 × 8.6 cm) for wedding guest prints.",
  robots: { index: false, follow: false },
};

export default function TemplatesPage() {
  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="font-display text-lg italic text-accent">Cute Wedding Polaroid</p>
          <h1 className="mt-1 font-display text-4xl italic sm:text-5xl">Polaroid templates</h1>
          <p className="mt-3 max-w-xl text-muted">
            Mini polaroids, 5.4 × 8.6 cm. Pick a style, type the couple&apos;s names and play with the
            colours. The couple locks their version before the wedding.
          </p>
        </div>
        <Link
          href="/templates/print-sheet"
          className="rounded-full border border-ink px-5 py-2.5 text-sm font-semibold hover:bg-ink hover:text-paper"
        >
          A4 print sheet
        </Link>
      </header>

      <section className="mt-10">
        <TemplatePlayground />
        <p className="mt-3 text-xs text-muted">
          *Real size depends on your screen&apos;s scaling; the print sheet is exact.
        </p>
      </section>

      <section className="mt-16">
        <h2 className="font-display text-3xl italic">All styles</h2>
        <ul className="mt-6 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4">
          {TEMPLATES.map((template) => (
            <li key={template.id} className="flex flex-col items-center text-center">
              <PolaroidCard
                uid={`gallery-${template.id}`}
                template={template}
                palette={template.defaultPalette}
                text={SAMPLE_TEXT}
                photoHref={SAMPLE_PHOTO}
                className="w-full max-w-[13rem] shadow-lg"
              />
              <h3 className="mt-4 font-semibold">{template.name}</h3>
              <p className="mt-1 text-sm text-muted">{template.description}</p>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
