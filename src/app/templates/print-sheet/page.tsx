import type { Metadata } from "next";
import Link from "next/link";
import { PrintSheet, type SheetCard } from "@/components/polaroid/print-sheet";
import { SAMPLE_PHOTO, SAMPLE_TEXT } from "@/lib/polaroid/samples";
import { computeSheetLayout } from "@/lib/polaroid/sheet";
import { TEMPLATES } from "@/lib/polaroid/templates";
import { PrintButton } from "./print-button";

export const metadata: Metadata = {
  title: "Print sheet preview",
  robots: { index: false, follow: false },
};

export default function PrintSheetPage() {
  const { slots } = computeSheetLayout();
  // Sample sheet: every template, repeated to fill all slots.
  const cards: SheetCard[] = slots.map((_, i) => {
    const template = TEMPLATES[i % TEMPLATES.length];
    return {
      key: `sample-${i}`,
      template,
      palette: template.defaultPalette,
      text: SAMPLE_TEXT,
      photoHref: SAMPLE_PHOTO,
    };
  });

  return (
    <main className="flex flex-1 flex-col items-center gap-6 bg-line/40 px-4 py-10 print:bg-white print:p-0">
      <div className="flex w-full max-w-[210mm] flex-wrap items-center justify-between gap-4 print:hidden">
        <div>
          <Link href="/templates" className="text-sm text-muted hover:text-ink">
            ← Templates
          </Link>
          <h1 className="font-display text-3xl italic">A4 print sheet</h1>
          <p className="text-sm text-muted">
            {slots.length} mini polaroids per sheet, with crop marks. Print at 100% (&quot;Actual size&quot;),
            margins &quot;None&quot;, on A4 photo paper.
          </p>
        </div>
        <PrintButton />
      </div>
      <div className="shadow-xl print:shadow-none">
        <PrintSheet cards={cards} uid="sheet" />
      </div>
    </main>
  );
}
