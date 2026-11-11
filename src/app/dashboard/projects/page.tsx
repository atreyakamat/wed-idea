import Link from "next/link";
import { Suspense } from "react";
import { ProjectStatusBadge } from "@/components/dashboard/project-status-badge";
import { UsageMeter } from "@/components/dashboard/usage-meter";
import { canManage, requireStudio } from "@/lib/auth";
import { isGalleryOpen } from "@/lib/capture/photos";
import { formatIstDate } from "@/lib/events/time";
import { PROJECT_KIND_LABELS } from "@/lib/projects/form";
import { listProjects } from "@/lib/projects/queries";
import { listPlans } from "@/lib/studio/billing";
import { istMonthRange } from "@/lib/studio/month";

export const metadata = { title: "Photo delivery" };

export default function ProjectsPage() {
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl italic">Photo delivery</h1>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Drop a shoot&apos;s folder in, hide the misses, and send everyone one private link. Works for weddings, birthdays, concerts
            and outdoor shoots.
          </p>
        </div>
        <Suspense fallback={null}>
          <Actions />
        </Suspense>
      </div>
      <Suspense fallback={<ListSkeleton />}>
        <ProjectList />
      </Suspense>
    </>
  );
}

async function Actions() {
  const { studio } = await requireStudio("/dashboard/projects");
  if (!canManage(studio.role)) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Link href="/dashboard/computers" className="rounded-full border border-line bg-surface px-5 py-2.5 text-sm font-semibold hover:border-ink">
        Connect a PC
      </Link>
      <Link href="/dashboard/projects/new" className="rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper hover:opacity-90">
        New project
      </Link>
    </div>
  );
}

async function ProjectList() {
  const { studio } = await requireStudio("/dashboard/projects");
  const [projects, plans] = await Promise.all([listProjects(studio.id), listPlans()]);
  const plan = plans.find((p) => p.id === studio.planId);
  const month = istMonthRange();
  const thisMonth = projects.filter((p) => p.created_at >= month.start && p.created_at < month.end).length;

  return (
    <>
      {plan ? (
        <div className="mt-6 max-w-sm">
          <UsageMeter label={`Projects in ${month.label}`} used={thisMonth} limit={plan.events_per_month} unit="projects" />
        </div>
      ) : null}

      {projects.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-line px-6 py-16 text-center">
          <p className="font-display text-2xl italic">No projects yet</p>
          <p className="mx-auto mt-2 max-w-sm text-sm text-muted">
            Create a project, drag the shoot&apos;s folder onto it, and publish. Guests get their photos within the hour.
          </p>
          {canManage(studio.role) ? (
            <Link href="/dashboard/projects/new" className="mt-6 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-paper">
              Create a project
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <li key={p.id}>
              <Link
                href={`/dashboard/projects/${p.id}`}
                className="flex h-full flex-col overflow-hidden rounded-2xl border border-line bg-surface transition hover:border-ink/40 hover:shadow-md"
              >
                <div className="aspect-[3/2] bg-line/50">
                  {p.coverUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element -- signed storage URL
                    <img src={p.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted">No photos yet</div>
                  )}
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold">{p.name}</p>
                    <ProjectStatusBadge status={p.status} expired={Boolean(p.gallery_expires_at && !isGalleryOpen(p.gallery_expires_at))} />
                  </div>
                  <p className="mt-1 text-sm text-muted">
                    {PROJECT_KIND_LABELS[p.kind]}
                    {p.shoot_date ? ` · ${formatIstDate(`${p.shoot_date}T12:00:00+05:30`)}` : ""}
                  </p>
                  <p className="mt-auto pt-3 text-xs text-muted">
                    {p.photoCount} photo{p.photoCount === 1 ? "" : "s"}
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ListSkeleton() {
  return (
    <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-64 animate-pulse rounded-2xl bg-line/60" />
      ))}
    </div>
  );
}
