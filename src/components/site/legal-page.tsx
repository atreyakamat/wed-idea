import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "./site-chrome";

export function LegalPage({ title, updated, children }: Readonly<{ title: string; updated: string; children: ReactNode }>) {
  return (
    <main className="flex-1">
      <SiteHeader />
      <article className="mx-auto max-w-2xl px-6 pb-20 pt-8 [&_h2]:mt-10 [&_h2]:text-xl [&_h2]:font-semibold [&_li]:mt-1.5 [&_p]:mt-3 [&_ul]:mt-3 [&_ul]:list-disc [&_ul]:pl-5 text-[15px] leading-relaxed">
        <h1 className="font-display text-5xl italic">{title}</h1>
        <p className="text-sm text-muted">Last updated {updated}</p>
        {children}
      </article>
      <SiteFooter />
    </main>
  );
}

export function Contact({ email }: Readonly<{ email: string | null }>) {
  return email ? (
    <a href={`mailto:${email}`} className="font-semibold underline underline-offset-4">
      {email}
    </a>
  ) : (
    <>the contact details on our website</>
  );
}
