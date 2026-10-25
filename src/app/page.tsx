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

const polaroids = [
  { caption: "the first dance", tilt: "-rotate-6", tone: "from-rose-200 to-amber-100" },
  { caption: "haldi chaos", tilt: "rotate-3", tone: "from-amber-200 to-orange-100" },
  { caption: "forever starts now", tilt: "-rotate-2", tone: "from-sky-200 to-rose-100" },
];

export default function Home() {
  return (
    <main className="flex-1">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6">
        <span className="font-display text-xl italic">Cute Wedding Polaroid</span>
        <a href="#how" className="text-sm text-muted hover:text-ink">
          How it works
        </a>
      </header>

      <section className="mx-auto grid max-w-5xl items-center gap-12 px-6 pb-20 pt-10 md:grid-cols-2">
        <FadeIn>
          <p className="font-display text-lg italic text-accent">for weddings in Goa &amp; beyond</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.05] sm:text-7xl">
            Every guest leaves with <em className="text-accent">a memory</em> in hand.
          </h1>
          <p className="mt-6 max-w-md text-lg text-muted">
            A polaroid backdrop at your wedding. Photos on your guests&apos; WhatsApp, prints at
            their door, and one simple bill for the couple.
          </p>
          <a
            href="#how"
            className="mt-8 inline-block rounded-full bg-ink px-6 py-3 text-sm font-semibold text-paper transition hover:opacity-90"
          >
            See how it works
          </a>
        </FadeIn>

        <div className="relative mx-auto flex h-80 w-full max-w-sm items-center justify-center" aria-hidden>
          {polaroids.map((p, i) => (
            <FadeIn
              key={p.caption}
              delay={0.15 * (i + 1)}
              className={`absolute ${p.tilt}`}
            >
              <div
                className="w-48 bg-white p-3 pb-10 shadow-xl"
                style={{ transform: `translate(${(i - 1) * 70}px, ${(i % 2) * 24 - 12}px)` }}
              >
                <div className={`aspect-square bg-gradient-to-br ${p.tone}`} />
                <p className="mt-3 text-center font-display text-lg italic text-neutral-700">
                  {p.caption}
                </p>
              </div>
            </FadeIn>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-line bg-surface/60">
        <div className="mx-auto max-w-5xl px-6 py-20">
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

      <footer className="mx-auto max-w-5xl px-6 py-10 text-sm text-muted">
        <span className="font-display italic">Cute Wedding Polaroid</span> · Goa, India
      </footer>
    </main>
  );
}
