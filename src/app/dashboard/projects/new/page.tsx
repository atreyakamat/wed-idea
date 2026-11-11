import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ProjectForm } from "@/components/dashboard/project-form";
import { canManage, requireStudio } from "@/lib/auth";
import { createProject } from "../actions";

export const metadata = { title: "New project" };

export default function NewProjectPage() {
  return (
    <div className="max-w-2xl">
      <Link href="/dashboard/projects" className="text-sm text-muted hover:text-ink">
        ← Photo delivery
      </Link>
      <h1 className="mt-2 font-display text-4xl italic">New project</h1>
      <p className="mt-1 text-sm text-muted">Next you&apos;ll drop in the photos, then publish one link for everyone.</p>
      <div className="mt-8 rounded-2xl border border-line bg-surface p-6 sm:p-8">
        <Suspense fallback={<div className="h-64" aria-hidden />}>
          <NewProjectForm />
        </Suspense>
      </div>
    </div>
  );
}

async function NewProjectForm() {
  const { studio } = await requireStudio("/dashboard/projects/new");
  if (!canManage(studio.role)) redirect("/dashboard/projects");
  return <ProjectForm action={createProject} defaults={{ name: "", kind: "other", shoot_date: "" }} submitLabel="Create project" pendingLabel="Creating…" />;
}
