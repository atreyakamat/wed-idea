import { Suspense } from "react";
import { canManage, requireStudio } from "@/lib/auth";
import { DATA, getLook, LIGHTING_GROUPS } from "@/lib/looks/data";
import { studioLogoUrl } from "@/lib/projects/gallery";
import { LIGHTING_LABELS } from "@/lib/projects/paths";
import { studioStyle } from "@/lib/projects/review";
import { createClient } from "@/lib/supabase/server";
import { LogoForm } from "./logo-form";
import { LookDefaults } from "./look-defaults";
import { LookSheetsForm } from "./look-sheets-form";
import { validDesigns } from "@/lib/projects/look-sheet";
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
          Choose the look for each kind of light, or leave it automatic: then the look you pick and approve in Review is learnt and used. Your choice here
          wins, in the browser and the PC app.
        </p>
        <Suspense fallback={<div className="h-40" aria-hidden />}>
          <Style />
        </Suspense>
      </section>
      <section className="mt-6 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <h2 className="text-lg font-semibold">Look sheets</h2>
        <p className="mt-1 text-sm text-muted">
          Clients get these for the photos they pick: every look on one photo, the original beside its look, or both.
        </p>
        <Suspense fallback={<div className="h-24" aria-hidden />}>
          <SheetSettings />
        </Suspense>
      </section>
    </div>
  );
}

async function Style() {
  const { studio } = await requireStudio("/dashboard/studio");
  const supabase = await createClient();
  const [style, { data }, { data: learntRows }, { data: chosenRows }] = await Promise.all([
    studioStyle(supabase, studio.id),
    supabase.from("studio_look_picks").select("picks").eq("organization_id", studio.id),
    supabase.rpc("studio_style", { p_org: studio.id }),
    supabase.from("studio_look_defaults").select("lighting, look").eq("organization_id", studio.id),
  ]);
  const picks = ((data ?? []) as { picks: number }[]).reduce((n, r) => n + r.picks, 0);
  const learnt: Record<string, string> = {};
  for (const r of (learntRows ?? []) as { lighting: string; look: string }[]) learnt[r.lighting] = r.look;
  const chosen: Record<string, string> = {};
  for (const r of (chosenRows ?? []) as { lighting: string; look: string }[]) chosen[r.lighting] = r.look;
  const standard: Record<string, string> = { ...DATA.defaultLook };
  const manager = canManage(studio.role);

  return (
    <>
      {manager ? (
        <LookDefaults groups={[...LIGHTING_GROUPS]} current={chosen} learnt={learnt} standard={standard} />
      ) : (
        <dl className="mt-5 divide-y divide-line text-sm">
          {LIGHTING_GROUPS.map((g) => (
            <div key={g} className="flex items-baseline justify-between gap-4 py-2.5">
              <dt className="text-muted">{LIGHTING_LABELS[g]}</dt>
              <dd className="font-medium">{getLook(style[g] ?? DATA.defaultLook[g]).name}</dd>
            </div>
          ))}
        </dl>
      )}
      <p className="mt-3 text-xs text-muted">{picks ? `Learnt from ${picks} pick${picks === 1 ? "" : "s"}.` : "Nothing learnt yet."}</p>
      {manager && picks ? <ResetStyleButton /> : null}
    </>
  );
}

async function SheetSettings() {
  const { studio } = await requireStudio("/dashboard/studio");
  const supabase = await createClient();
  const { data } = await supabase.from("organizations").select("look_sheets").eq("id", studio.id).single();
  const current = validDesigns(data?.look_sheets);
  if (!canManage(studio.role)) return <p className="mt-5 text-sm">{current.length ? current.map((d) => (d === "grid" ? "Grid of looks" : "Before and after")).join(", ") : "Off"}</p>;
  return <LookSheetsForm current={current} />;
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
