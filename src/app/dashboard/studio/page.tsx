import { Suspense } from "react";
import { canManage, requireStudio } from "@/lib/auth";
import { studioLogoUrl } from "@/lib/projects/gallery";
import { createClient } from "@/lib/supabase/server";
import { LogoForm } from "./logo-form";

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
    </div>
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
