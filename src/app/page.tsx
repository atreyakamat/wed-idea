import Link from "next/link";
import { FilterStrip } from "@/components/polaroid/filter-strip";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import { SAMPLE_PHOTO, SAMPLE_TEXT } from "@/lib/polaroid/samples";
import { getTemplate, TEMPLATES } from "@/lib/polaroid/templates";
import type { PolaroidTemplate } from "@/lib/polaroid/types";
import { FadeIn } from "./fade-in";

const steps = [
  {
    title: "Snap at the backdrop",
    body: "Guests pose, we shoot. A short code makes sure every photo finds its owner.",
  },
  {
    title: "Photos on WhatsApp",
    body: "A private link lands on their phone the same day. Photos stay up for 7 days.",
  },
  {
    title: "Polaroids at their door",
    body: "Guests order prints during the event. We courier them anywhere in India in 1–2 days.",
  },
];

const forCouples = [
  {
    title: "Your own design",
    body: "Pick a style, add your names, date and colours. You lock it before the wedding.",
  },
  {
    title: "One simple bill",
    body: "Every print and courier charge on one statement at the end. No surprises.",
  },
  {
    title: "You set the limits",
    body: "Cap copies per guest or the total budget. Orders close when you say.",
  },
  {
    title: "Private by default",
    body: "Each guest sees only their own photos, and everything is deleted after 7 days.",
  },
];

// Hero fan: three styles, tilted like prints on a table.
const HERO = [
  { id: "goa-doodle", className: "-rotate-[10deg] -translate-x-[62%] translate-y-8", delay: 0.15 },
  { id: "boarding-pass", className: "rotate-[9deg] translate-x-[62%] translate-y-6", delay: 0.3 },
  { id: "elegant-floral", className: "-rotate-1 -translate-y-2", delay: 0.45 },
];

function Card({ template, uid, className }: { template: PolaroidTemplate; uid: string; className: string }) {
  return (
    <PolaroidCard
      uid={uid}
      template={template}
      palette={template.defaultPalette}
      text={SAMPLE_TEXT}
      photoHref={SAMPLE_PHOTO}
      className={className}
    />
  );
}

export default function Home() {
  return (
    <main className="flex-1 overflow-x-hidden">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl italic">Cute Wedding Polaroid</span>
        <nav className="flex items-center gap-5 text-sm text-muted">
          <a href="#how" className="hidden hover:text-ink sm:inline">
            How it works
          </a>
          <Link href="/templates" className="hover:text-ink">
            Templates
          </Link>
        </nav>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-8 md:grid-cols-2">
        <FadeIn>
          <p className="font-display text-lg italic text-accent">for weddings in Goa &amp; beyond</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.05] sm:text-7xl">
            Every guest leaves with <em className="text-accent">a memory</em> in hand.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted">
            A polaroid backdrop at your wedding. Photos on your guests&apos; WhatsApp, prints at their
            door, and one simple bill for the couple.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/templates"
              className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:opacity-90"
            >
              Design your polaroid
            </Link>
            <a
              href="#how"
              className="rounded-full border border-line px-6 py-3 text-sm font-semibold transition hover:border-ink"
            >
              How it works
            </a>
          </div>
        </FadeIn>

        <div className="relative mx-auto flex h-[24rem] w-full max-w-md items-center justify-center sm:h-[28rem]" aria-hidden>
          {HERO.map((h) => {
            const template = getTemplate(h.id);
            if (!template) return null;
            return (
              <FadeIn key={h.id} delay={h.delay} className={`absolute ${h.className}`}>
                <Card template={template} uid={`hero-${h.id}`} className="w-40 drop-shadow-xl sm:w-48" />
              </FadeIn>
            );
          })}
        </div>
      </section>

      <section id="how" className="border-t border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-4xl italic sm:text-5xl">How it works</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {steps.map((step, index) => (
              <FadeIn
                key={step.title}
                as="li"
                delay={0.1 * (index + 1)}
                className="rounded-2xl border border-line bg-surface p-6"
              >
                <span className="font-display text-4xl italic text-accent">{index + 1}</span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </FadeIn>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl italic sm:text-5xl">{TEMPLATES.length} styles. One is yours.</h2>
            <p className="mt-3 max-w-lg text-muted">
              From Goan azulejo tiles to a boarding pass for your destination wedding. Every card is
              5.4 × 8.6 cm, the classic mini polaroid.
            </p>
          </div>
          <Link href="/templates" className="text-sm font-semibold underline underline-offset-4 hover:text-accent">
            Try them with your names →
          </Link>
        </div>

        <ul className="-mx-6 mt-10 flex snap-x gap-5 overflow-x-auto px-6 pb-4 sm:mx-0 sm:flex-wrap sm:justify-center sm:gap-8 sm:overflow-visible sm:px-0">
          {TEMPLATES.map((template) => (
            <li key={template.id} className="w-36 shrink-0 snap-start text-center sm:w-40">
              <Link href="/templates" className="group block">
                <Card
                  template={template}
                  uid={`styles-${template.id}`}
                  className="mx-auto w-full max-w-[10rem] shadow-md transition group-hover:-translate-y-1 group-hover:shadow-xl"
                />
                <p className="mt-3 text-sm font-semibold">{template.name}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-4xl italic sm:text-5xl">Six filters, printed true</h2>
          <p className="mt-3 max-w-lg text-muted">
            Warm Goa sunsets, faded film, classic black and white. What you see on your phone is what
            lands in your hand.
          </p>
          <div className="mt-10">
            <FilterStrip uid="home-filters" />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-4xl italic sm:text-5xl">Made easy for the couple</h2>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {forCouples.map((item, index) => (
            <FadeIn key={item.title} as="li" delay={0.08 * index} className="border-t border-ink/15 pt-5">
              <h3 className="font-display text-2xl italic">{item.title}</h3>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
            </FadeIn>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="rounded-3xl bg-ink px-8 py-14 text-center text-paper sm:px-16">
          <p className="font-display text-4xl italic sm:text-5xl">Let&apos;s make your guests smile.</p>
          <p className="mx-auto mt-4 max-w-md text-paper/70">
            Design your polaroid in a minute, then we&apos;ll bring the backdrop.
          </p>
          <Link
            href="/templates"
            className="mt-8 inline-block rounded-full bg-paper px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90"
          >
            Design your polaroid
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 pb-10 text-sm text-muted">
        <span className="font-display italic">Cute Wedding Polaroid</span> · Goa, India
      </footer>
    </main>
  );
}
