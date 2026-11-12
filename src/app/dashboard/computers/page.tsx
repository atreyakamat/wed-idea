import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { canManage, requireStudio } from "@/lib/auth";
import { publicEnv } from "@/lib/env";
import { formatIstDateTime } from "@/lib/events/time";
import { createClient } from "@/lib/supabase/server";
import { ConnectForm, DisconnectButton } from "./connect-form";

export const metadata = { title: "Connect a PC" };

/** Where the installers are published (GitHub releases of this repo, unless set). */
function downloadBase(): string {
  let base = process.env.NEXT_PUBLIC_PC_APP_DOWNLOAD_BASE || "https://github.com/atreyakamat/wed-idea/releases/latest/download";
  while (base.endsWith("/")) base = base.slice(0, -1);
  return base;
}

const DOWNLOADS = [
  { label: "Download for Windows", file: "CuteWeddingPolaroid-Windows-Setup.exe" },
  { label: "Mac (Apple silicon)", file: "CuteWeddingPolaroid-Mac-AppleSilicon.dmg" },
  { label: "Mac (Intel)", file: "CuteWeddingPolaroid-Mac-Intel.dmg" },
];

type TokenRow = { id: string; name: string; token_hint: string; created_at: string; last_used_at: string | null; revoked_at: string | null };

export default function ComputersPage() {
  return (
    <div className="max-w-3xl">
      <Link href="/dashboard/projects" className="text-sm text-muted hover:text-ink">
        ← Photo delivery
      </Link>
      <h1 className="mt-2 font-display text-4xl italic">Connect a PC</h1>
      <p className="mt-1 text-sm text-muted">
        The PC app watches a folder (a camera card, or a Google Drive folder synced to your computer) and uploads new photos to the
        matching project on its own. Originals stay on your computer.
      </p>

      <ol className="mt-8 flex flex-col gap-6">
        <Step n={1} title="Install the app (once per computer)">
          <div className="flex flex-wrap gap-2">
            {DOWNLOADS.map((d) => (
              <a key={d.file} href={`${downloadBase()}/${d.file}`} className="rounded-full bg-ink px-4 py-2 text-sm font-semibold text-paper hover:opacity-90">
                {d.label}
              </a>
            ))}
          </div>
          <ul className="mt-3 list-disc space-y-1 pl-5">
            <li>
              <strong className="text-ink">Windows:</strong> run the Setup file. If Windows says it protected your PC, choose <em>More info → Run anyway</em>.
            </li>
            <li>
              <strong className="text-ink">Mac:</strong> open the .dmg and drag the app to Applications. The first time, right-click the app and choose{" "}
              <em>Open</em> (or allow it in System Settings → Privacy &amp; Security). Apple silicon is for M1 and newer Macs.
            </li>
          </ul>
          <details className="mt-3">
            <summary className="cursor-pointer text-ink">Prefer the command line?</summary>
            <p className="mt-2">With Python 3.10 or newer:</p>
            <code className="mt-2 block rounded-xl border border-line bg-paper px-3 py-2 text-xs">pip install &quot;cwp-worker @ git+https://github.com/atreyakamat/wed-idea#subdirectory=worker&quot;</code>
          </details>
        </Step>
        <Step n={2} title="Connect it to your studio">
          <Suspense fallback={<div className="h-16" aria-hidden />}>
            <Connect />
          </Suspense>
        </Step>
        <Step n={3} title="Point it at a folder">
          <p>
            In the app, choose the folder and press <strong className="text-ink">Start</strong>. Each subfolder becomes a project named after it (or tick
            &ldquo;This folder is one shoot&rdquo;), and new photos upload and auto-edit as they land.
          </p>
          <p className="mt-3">From the command line instead:</p>
          <code className="mt-2 block rounded-xl border border-line bg-paper px-3 py-2 text-xs">cwp-worker watch &quot;~/Google Drive/Shoots&quot;</code>
          <p className="mt-2">Or upload one folder into one project, then stop:</p>
          <code className="mt-2 block rounded-xl border border-line bg-paper px-3 py-2 text-xs">cwp-worker upload &quot;~/Pictures/Meera 30th&quot; --project meeras-30th</code>
        </Step>
      </ol>

      <Suspense fallback={null}>
        <Computers />
      </Suspense>
    </div>
  );
}

function Step({ n, title, children }: Readonly<{ n: number; title: string; children: React.ReactNode }>) {
  return (
    <li className="rounded-2xl border border-line bg-surface p-6">
      <h2 className="flex items-center gap-3 font-semibold">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ink text-sm text-paper">{n}</span>
        {title}
      </h2>
      <div className="mt-3 text-sm text-muted">{children}</div>
    </li>
  );
}

async function Connect() {
  const { studio } = await requireStudio("/dashboard/computers");
  if (!canManage(studio.role)) redirect("/dashboard/projects");
  return <ConnectForm siteUrl={publicEnv().NEXT_PUBLIC_SITE_URL} />;
}

async function Computers() {
  const { studio } = await requireStudio("/dashboard/computers");
  const supabase = await createClient();
  const { data } = await supabase
    .from("worker_tokens")
    .select("id, name, token_hint, created_at, last_used_at, revoked_at")
    .eq("organization_id", studio.id)
    .is("revoked_at", null)
    .order("created_at", { ascending: false })
    .overrideTypes<TokenRow[], { merge: false }>();
  const rows = data ?? [];
  if (!rows.length) return null;

  return (
    <section className="mt-10">
      <h2 className="text-lg font-semibold">Connected computers</h2>
      <ul className="mt-3 divide-y divide-line rounded-2xl border border-line bg-surface">
        {rows.map((t) => (
          <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div>
              <p className="font-medium">{t.name}</p>
              <p className="text-xs text-muted">
                Key ending …{t.token_hint} · connected {formatIstDateTime(t.created_at)} ·{" "}
                {t.last_used_at ? `last seen ${formatIstDateTime(t.last_used_at)}` : "not used yet"}
              </p>
            </div>
            <DisconnectButton tokenId={t.id} name={t.name} />
          </li>
        ))}
      </ul>
    </section>
  );
}
