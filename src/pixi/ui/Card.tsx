/** The grouped card used on the Share and Build screens: a title, a line of guidance, then content. */
export function Card({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] bg-white/[0.05] p-4">
      <h2 className="text-[1.0625rem] font-semibold tracking-[-0.01em]">{title}</h2>
      {note && <p className="mb-3 mt-0.5 text-[0.8125rem] leading-relaxed text-white/45">{note}</p>}
      <div className="space-y-3">{children}</div>
    </section>
  );
}
