import { FadeIn } from "./fade-in";

// Placeholder home page. The full marketing landing page is a later step.
const steps = [
  {
    title: "Snap at the backdrop",
    body: "Guests pose, we shoot. Each guest gets a short code so their photos find them.",
  },
  {
    title: "Photos on WhatsApp",
    body: "A private link to their photos lands on their phone. Photos stay up for 7 days.",
  },
  {
    title: "Polaroids at their door",
    body: "Guests order prints during the event. We courier them anywhere in India in 1–2 days.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center px-4 py-20 sm:px-6">
      <FadeIn>
        <p className="text-sm font-medium uppercase tracking-widest text-accent">Coming soon</p>
        <h1 className="mt-4 font-display text-4xl leading-tight sm:text-6xl">
          Cute Wedding Polaroid
        </h1>
        <p className="mt-4 max-w-xl text-lg text-muted">
          A keepsake for every guest, with the bill handled by the couple in one statement.
        </p>
      </FadeIn>

      <ol className="mt-14 grid gap-4 sm:grid-cols-3">
        {steps.map((step, index) => (
          <FadeIn
            key={step.title}
            as="li"
            delay={0.1 * (index + 1)}
            className="h-full rounded-2xl border border-line bg-surface p-6"
          >
            <span className="font-display text-3xl text-accent">{index + 1}</span>
            <h2 className="mt-3 font-semibold">{step.title}</h2>
            <p className="mt-2 text-sm text-muted">{step.body}</p>
          </FadeIn>
        ))}
      </ol>
    </main>
  );
}
