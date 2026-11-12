import { notFound } from "next/navigation";
import { Suspense } from "react";
import { requireStudio } from "@/lib/auth";
import { getProject } from "@/lib/projects/queries";
import { reviewItems, studioStyle } from "@/lib/projects/review";
import { createClient } from "@/lib/supabase/server";
import { ReviewScreen } from "./review-screen";

export const metadata = { title: "Review photos" };

export default function ReviewPage({ params }: PageProps<"/dashboard/projects/[projectId]/review">) {
  return (
    <Suspense fallback={<div className="fixed inset-0 z-50 grid place-items-center bg-neutral-950 text-sm text-neutral-400">Loading photos…</div>}>
      <Review params={params} />
    </Suspense>
  );
}

async function Review({ params }: Readonly<{ params: PageProps<"/dashboard/projects/[projectId]/review">["params"] }>) {
  const { projectId } = await params;
  const { studio } = await requireStudio(`/dashboard/projects/${projectId}/review`);
  const project = await getProject(studio.id, projectId);
  if (!project) notFound();
  const supabase = await createClient();
  const [items, style] = await Promise.all([reviewItems(supabase, project.id), studioStyle(supabase, studio.id)]);
  return <ReviewScreen projectId={project.id} organizationId={studio.id} projectName={project.name} initialItems={items} style={style} />;
}
