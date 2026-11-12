import { Suspense } from "react";
import { canManage, requireStudio } from "@/lib/auth";
import { DATA, getLook, LIGHTING_GROUPS } from "@/lib/looks/data";
import { studioLogoUrl } from "@/lib/projects/gallery";
import { LIGHTING_LABELS } from "@/lib/projects/paths";
import { studioStyle } from "@/lib/projects/review";
import { createClient } from "@/lib/supabase/server";
import { LogoForm } from "./logo-form";
import { ResetStyleButton } from "./reset-style";

export const metadata = { title: "Studio" };

export default function StudioPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="font-display text-4xl italic">Your studio</h1>
      <p className="mt-1 text-sm text-muted">How your studio appears to couples and guests.</p>
      <section className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Logo</h2>
        <p className="mt-1 text-sm text-muted">Shown at the top of every gallery you share. A wide PNG with a transparent background works best.</p>
        <div className="mt-5">
          <Suspense fallback={<div className="h-24" aria-hidden />}>
            <Logo />
          </Suspense>
        </div>
      </section>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Your editing style</h2>
        <p className="mt-1 text-sm text-muted">
          Learnt from the looks you pick and approve in Review. Once a look is your clear favourite for a kind of light, new photos in that light get it
          automatically, in the browser and the PC app.
        </p>
        <Suspense fallback={<div className="h-40" aria-hidden />}>
          <Style />
        </Suspense>
      </section>
    </div>
  );
}

async function Style() {
  const { studio } = await requireStudio("/dashboard/studio");
  const supabase = await createClient();
  const [style, { data }] = await Promise.all([studioStyle(supabase, studio.id), supabase.from("studio_look_picks").select("picks").eq("organization_id", studio.id)]);
  const picks = ((data ?? []) as { picks: number }[]).reduce((n, r) => n + r.picks, 0);
  return (
    <>
      <dl className="mt-5 divide-y divide-line text-sm">
        {LIGHTING_GROUPS.map((g) => (
          <div key={g} className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="text-muted">{LIGHTING_LABELS[g]}</dt>
            <dd className="font-medium">
              {getLook(style[g] ?? DATA.defaultLook[g]).name}
              <span className="ml-2 text-xs font-normal text-muted">{style[g] ? "your pick" : "standard"}</span>
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted">{picks ? `Learnt from ${picks} pick${picks === 1 ? "" : "s"}.` : "Nothing learnt yet."}</p>
      {canManage(studio.role) && picks ? <ResetStyleButton /> : null}
    </>
  );
}

async function Logo() {
  const { studio } = await requireStudio("/dashboard/studio");
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("logo_path").eq("id", studio.id).single();
  const url = studioLogoUrl((data?.logo_path as string | null) ?? null);
  if (!canManage(studio.role)) {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element -- public studio logo
      <img src={url} alt="Studio logo" className="h-16 w-auto" />
    ) : (
      <p className="text-sm text-muted">No logo yet. Ask a studio owner to add one.</p>
    )
  }
  return <LogoForm studioId={studio.id} logoUrl={url} />;
}
