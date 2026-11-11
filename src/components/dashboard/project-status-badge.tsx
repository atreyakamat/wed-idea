import type { ProjectStatus } from "@/lib/projects/queries";

const LABELS: Record<ProjectStatus, string> = { draft: "Not shared", published: "Shared", archived: "Archived" };
const STYLES: Record<ProjectStatus, string> = {
  draft: "bg-line text-muted",
  published: "bg-success/15 text-success",
  archived: "bg-line text-muted",
};

export function ProjectStatusBadge({ status, expired = false }: Readonly<{ status: ProjectStatus; expired?: boolean }>) {
  if (status === "published" && expired) {
    return <span className="inline-flex rounded-full bg-line px-2.5 py-1 text-xs font-medium text-muted">Link expired</span>;
  }
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${STYLES[status]}`}>
      {status === "published" ? <span className="h-1.5 w-1.5 rounded-full bg-success" aria-hidden /> : null}
      {LABELS[status]}
    </span>
  );
}
