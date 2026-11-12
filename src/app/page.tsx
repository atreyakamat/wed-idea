import Link from "next/link";
import { FilterStrip } from "@/components/polaroid/filter-strip";
import { PolaroidCard } from "@/components/polaroid/polaroid-card";
import { SAMPLE_PHOTO, SAMPLE_TEXT } from "@/lib/polaroid/samples";
import { getTemplate, TEMPLATES } from "@/lib/polaroid/templates";
import type { PolaroidTemplate } from "@/lib/polaroid/types";
import { SiteFooter, SiteHeader } from "@/components/site/site-chrome";
import { FadeIn } from "./fade-in";

const deliverySteps = [
  {
    title: "Drop the shoot's folder",
    body: "Drag it into the browser, or let the PC app watch your camera card or Google Drive folder. New photos upload as they land.",
  },
  {
    title: "Every photo edited to its light",
    body: "Each photo's light is read (daylight, golden hour, indoor, stage, night), exposure and white balance are fixed, and one of 25 looks is applied. Swap any look in one tap; it learns your style.",
  },
  {
    title: "One link for everyone",
    body: "Hide the misses, publish, and send one private link on WhatsApp. Guests have their photos the same evening.",
  },
];

const guestFeatures = [
  { title: "Opens like an album", body: "A cover photo, your logo, and photos in the order they were taken. No app, no sign-up." },
  { title: "Save to Photos", body: "One tap saves a photo straight to an iPhone or Android camera roll." },
  { title: "Favourites", body: "Guests ❤ the ones they love. You see which photos everyone loved most." },
  { title: "Download all", body: "Every photo, or just the favourites, as a zip. Phones get it in easy parts." },
];

const forStudios = [
  { title: "Review in minutes", body: "Flip through with the arrow keys, swap a look with 1–5, approve with Enter. One click puts a look on every photo in the same light." },
  { title: "Learns your style", body: "Pick the same look a few times and new photos in that light start with it, in the browser and the PC app." },
  { title: "Your brand", body: "Your logo on every gallery. Remove our name on the Pro plan." },
  { title: "Originals stay with you", body: "Only web-size copies are uploaded. Your RAWs and full-size files never leave your computer." },
  { title: "Private by default", body: "Galleries open only with their link, aren't on search engines, and close after your plan's gallery period." },
  { title: "Live polaroid corner", body: "Run a backdrop at the event: each guest's photo is tagged to their WhatsApp number and printed in the couple's design." },
];

const faqs = [
  {
    q: "Do I need to install anything?",
    a: "No. Upload from the browser and every photo is auto-edited right there. The free PC app is for hands-off days: it watches a folder (a camera card or Google Drive) and uploads photos on their own.",
  },
  {
    q: "How fast is it?",
    a: "Each photo takes about a second to edit and upload on a normal laptop, so a 500-photo shoot is ready in roughly 10 minutes.",
  },
  {
    q: "What happens to guests' photos and numbers?",
    a: "They're used only to deliver the photos. Galleries close after your plan's gallery period, and anyone can ask for their photos to be removed. See the Privacy policy.",
  },
  {
    q: "Can guests order prints?",
    a: "Not yet. Printed polaroids delivered across India are coming soon. Today guests save and download their photos.",
  },
  {
    q: "How do I pay?",
    a: "Start with the free trial. Plans are monthly; for now we invoice by UPI or bank transfer, and online checkout is on its way.",
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
      <SiteHeader />

      <section className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-8 md:grid-cols-2">
        <FadeIn>
          <p className="font-display text-lg italic text-accent">for wedding &amp; event photographers</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.05] sm:text-7xl">
            Guests get their photos <em className="text-accent">tonight</em>.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted">
            Drop the shoot&apos;s folder. Every photo is edited to suit its light and lands in one private gallery you
            share on WhatsApp, within the hour.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/signup" className="rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:opacity-90">
              Start your free trial
            </Link>
            <Link href="/pricing" className="rounded-full border border-line px-6 py-3 text-sm font-semibold transition hover:border-ink">
              See pricing
            </Link>
          </div>
          <p className="mt-4 text-sm text-muted">Free trial. No card needed.</p>
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
          <h2 className="font-display text-4xl italic sm:text-5xl">From card to WhatsApp in three steps</h2>
          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {deliverySteps.map((step, index) => (
              <FadeIn key={step.title} as="li" delay={0.1 * (index + 1)} className="rounded-2xl border border-line bg-surface p-6">
                <span className="font-display text-4xl italic text-accent">{index + 1}</span>
                <h3 className="mt-3 font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted">{step.body}</p>
              </FadeIn>
            ))}
          </ol>
          <p className="mt-8 text-sm text-muted">25 looks, five for each kind of light: from Bright &amp; Airy and Golden Glow to Candlelight, Neon Night and Classic B&amp;W.</p>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-4xl italic sm:text-5xl">A gallery guests keep coming back to</h2>
        <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {guestFeatures.map((item, index) => (
            <FadeIn key={item.title} as="li" delay={0.08 * index} className="border-t border-ink/15 pt-5">
              <h3 className="font-display text-2xl italic">{item.title}</h3>
              <p className="mt-2 text-sm text-muted">{item.body}</p>
            </FadeIn>
          ))}
        </ul>
      </section>

      <section className="border-t border-line bg-surface/60">
        <div className="mx-auto max-w-6xl px-6 py-20">
          <h2 className="font-display text-4xl italic sm:text-5xl">Built for studios</h2>
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {forStudios.map((item, index) => (
              <FadeIn key={item.title} as="li" delay={0.08 * index} className="rounded-2xl border border-line bg-surface p-6">
                <h3 className="font-semibold">{item.title}</h3>
                <p className="mt-2 text-sm text-muted">{item.body}</p>
              </FadeIn>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-4xl italic sm:text-5xl">{TEMPLATES.length} polaroid styles for the live corner</h2>
            <p className="mt-3 max-w-lg text-muted">
              The couple picks a style and adds their names, date and colours. Every guest&apos;s photo comes out in it,
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
                <Card template={template} uid={`styles-${template.id}`} className="mx-auto w-full max-w-[10rem] shadow-md transition group-hover:-translate-y-1 group-hover:shadow-xl" />
                <p className="mt-3 text-sm font-semibold">{template.name}</p>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-12">
          <FilterStrip uid="home-filters" />
        </div>
      </section>

      <section className="border-t border-line bg-surface/60">
        <div className="mx-auto max-w-3xl px-6 py-20">
          <h2 className="font-display text-4xl italic sm:text-5xl">Questions</h2>
          <dl className="mt-8 divide-y divide-line">
            {faqs.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 text-sm text-muted">{f.a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <div className="rounded-3xl bg-ink px-8 py-14 text-center text-paper sm:px-16">
          <p className="font-display text-4xl italic sm:text-5xl">Deliver your next shoot tonight.</p>
          <p className="mx-auto mt-4 max-w-md text-paper/70">Create your studio in a minute and try it on a real shoot.</p>
          <Link href="/signup" className="mt-8 inline-block rounded-full bg-paper px-6 py-3 text-sm font-semibold text-ink transition hover:opacity-90">
            Start your free trial
          </Link>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
