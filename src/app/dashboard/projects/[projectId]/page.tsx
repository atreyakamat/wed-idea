import Link from "next/link";
import { notFound } from "next/navigation";
import QRCode from "qrcode";
import { Suspense } from "react";
import { ProjectForm } from "@/components/dashboard/project-form";
import { ProjectStatusBadge } from "@/components/dashboard/project-status-badge";
import { UsageMeter } from "@/components/dashboard/usage-meter";
import { canManage, requireStudio } from "@/lib/auth";
import { isGalleryOpen } from "@/lib/capture/photos";
import { publicEnv } from "@/lib/env";
import { formatIstDate } from "@/lib/events/time";
import { PROJECT_KIND_LABELS } from "@/lib/projects/form";
import { countProjectPhotos, getProject, projectFileNames, projectPhotoPage } from "@/lib/projects/queries";
import { projectGalleryUrl, projectShareMessage } from "@/lib/projects/share";
import { listPlans } from "@/lib/studio/billing";
import { accessFor, blockedMessage } from "@/lib/studio/status";
import { createClient } from "@/lib/supabase/server";
import { updateProject } from "../actions";
import { FolderUploader } from "./folder-uploader";
import { PhotoGrid } from "./photo-grid";
import { ProjectControls } from "./project-controls";

export default function ProjectPage({ params }: PageProps<"/dashboard/projects/[projectId]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Project params={params} />
    </Suspense>
  );
}

export const metadata = { title: "Project" };

async function Project({ params }: Readonly<{ params: PageProps<"/dashboard/projects/[projectId]">["params"] }>) {
  const { projectId } = await params;
  const { studio } = await requireStudio(`/dashboard/projects/${projectId}`);
  const project = await getProject(studio.id, projectId);
  if (!project) notFound();

  const supabase = await createClient();
  const [counts, firstPage, fileNames, plans] = await Promise.all([
    countProjectPhotos(project.id, supabase),
    projectPhotoPage(supabase, project.id, 0),
    projectFileNames(project.id, supabase),
    listPlans(),
  ]);
  const plan = plans.find((p) => p.id === studio.planId);
  const manager = canManage(studio.role);
  const blocked = blockedMessage(accessFor(studio));
  const open = project.status === "published" && project.gallery_expires_at !== null && isGalleryOpen(project.gallery_expires_at);

  let share: { url: string; message: string; qrSvg: string; expiresAt: string } | null = null;
  if (open && project.gallery_expires_at) {
    const url = projectGalleryUrl(publicEnv().NEXT_PUBLIC_SITE_URL, project.access_token);
    share = {
      url,
      message: projectShareMessage({ projectName: project.name, studioName: studio.name, url, expiresAt: project.gallery_expires_at }),
      qrSvg: await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M" }),
      expiresAt: project.gallery_expires_at,
    };
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/dashboard/projects" className="text-sm text-muted hover:text-ink">
          ← Photo delivery
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-4xl italic">{project.name}</h1>
          <ProjectStatusBadge status={project.status} expired={project.status === "published" && !open} />
        </div>
        <p className="mt-1 text-sm text-muted">
          {PROJECT_KIND_LABELS[project.kind]}
          {project.shoot_date ? ` · ${formatIstDate(`${project.shoot_date}T12:00:00+05:30`)}` : ""} · Folder name for the PC app:{" "}
          <code className="rounded bg-line/60 px-1.5 py-0.5 text-xs text-ink">{project.slug}</code>
        </p>
      </div>

      <ProjectControls
        projectId={project.id}
        status={project.status}
        canManage={manager}
        visiblePhotos={counts.visible}
        everShared={Boolean(project.first_published_at)}
        expired={project.status === "published" && !open}
        share={share}
      />

      <section aria-labelledby="photos-heading" className="flex flex-col gap-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 id="photos-heading" className="text-lg font-semibold">
              Photos
            </h2>
            <p className="text-sm text-muted">
              {counts.total} uploaded{counts.total !== counts.visible ? `, ${counts.total - counts.visible} hidden from guests` : ""}.
            </p>
          </div>
          {plan ? (
            <div className="w-full max-w-xs">
              <UsageMeter label="Photos in this project" used={counts.total} limit={plan.photos_per_event} unit="photos" />
            </div>
          ) : null}
        </div>

        {project.status === "archived" ? (
          <p className="rounded-2xl border border-line bg-surface px-5 py-4 text-sm text-muted">This project is archived. Restore it to add photos.</p>
        ) : blocked ? (
          <p role="alert" className="rounded-2xl bg-danger/10 px-5 py-4 text-sm text-danger">
            {blocked}
          </p>
        ) : (
          <FolderUploader
            projectId={project.id}
            organizationId={project.organization_id}
            existingNames={fileNames}
            remaining={plan ? Math.max(0, plan.photos_per_event - counts.total) : null}
          />
        )}

        <PhotoGrid key={`${counts.total}-${counts.visible}`} projectId={project.id} initial={firstPage} canDelete={manager} />
      </section>

      {manager ? (
        <details className="rounded-2xl border border-line bg-surface p-6">
          <summary className="cursor-pointer text-sm font-semibold">Edit details</summary>
          <div className="mt-5 max-w-xl">
            <ProjectForm
              action={updateProject.bind(null, project.id)}
              defaults={{ name: project.name, kind: project.kind, shoot_date: project.shoot_date ?? "" }}
              submitLabel="Save details"
            />
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div className="h-12 w-72 animate-pulse rounded-xl bg-line/60" />
      <div className="h-40 animate-pulse rounded-2xl bg-line/60" />
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="aspect-square animate-pulse rounded-lg bg-line/60" />
        ))}
      </div>
    </div>
  );
}
