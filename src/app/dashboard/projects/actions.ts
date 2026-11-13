"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import type { FormState } from "@/components/ui/form";
import { requireStudio, requireStudioManager } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { parseProjectForm } from "@/lib/projects/form";
import { PROJECT_BUCKET, projectPhotoPaths } from "@/lib/projects/paths";
import {
  getProject,
  projectFileNames,
  projectPhotoPage,
  recordProjectPhoto,
  type NewProjectPhoto,
  type ProjectPhoto,
  type ProjectStatus,
  type RecordResult,
} from "@/lib/projects/queries";
import { uniqueProjectSlug } from "@/lib/projects/slug";
import { accessFor, blockedMessage, canStartWork, friendlyDbError } from "@/lib/studio/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

async function memberProject(projectId: string) {
  const { user, studio } = await requireStudio();
  const project = await getProject(studio.id, projectId);
  if (!project) throw new Error("Project not found.");
  return { user, studio, project };
}

async function managerProject(projectId: string) {
  const { user, studio } = await requireStudioManager();
  const project = await getProject(studio.id, projectId);
  if (!project) throw new Error("Project not found.");
  return { user, studio, project };
}

export async function createProject(_prev: FormState, formData: FormData): Promise<FormState> {
  const { studio } = await requireStudioManager();
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return { error: null, fieldErrors: parsed.fieldErrors, values: parsed.values };
  const values = { name: parsed.data.name, kind: parsed.data.kind, shoot_date: parsed.data.shoot_date ?? "" };
  const blocked = blockedMessage(accessFor(studio));
  if (blocked) return { error: blocked, values };

  const supabase = await createClient();
  // Two people creating "Meera 30th" at once: the loser retries with "-2".
  for (let attempt = 0; attempt < 3; attempt++) {
    const taken = await supabase.from("projects").select("slug").eq("organization_id", studio.id);
    if (taken.error) break;
    const slug = uniqueProjectSlug(parsed.data.name, new Set(taken.data.map((p) => p.slug as string)));
    const { data, error } = await supabase
      .from("projects")
      .insert({ ...parsed.data, slug, organization_id: studio.id })
      .select("id")
      .single();
    if (!error) redirect(`/dashboard/projects/${data.id}`);
    if (error.code !== "23505") return { error: friendlyDbError(error) ?? "Couldn't create the project. Try again.", values };
  }
  return { error: "Couldn't create the project. Try again.", values };
}

export async function updateProject(projectId: string, _prev: FormState, formData: FormData): Promise<FormState> {
  const { studio } = await managerProject(projectId);
  const parsed = parseProjectForm(formData);
  if (!parsed.ok) return { error: null, fieldErrors: parsed.fieldErrors, values: parsed.values };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").update(parsed.data).eq("id", projectId).eq("organization_id", studio.id);
  if (error) return { error: friendlyDbError(error) ?? "Couldn't save the details. Try again." };
  refresh();
  return { error: null, success: "Details saved." };
}

/** Turns the client's selection on or off: when on, guests can download only the photos they hearted. */
export async function setSelectionOnly(projectId: string, on: boolean): Promise<FormState> {
  const { studio } = await managerProject(projectId);
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ selection_only: on === true }).eq("id", projectId).eq("organization_id", studio.id);
  if (error) return { error: friendlyDbError(error) ?? "Couldn't save that. Try again." };
  refresh();
  return { error: null, success: on ? "On. Guests can download only the photos they picked." : "Off. Guests can download every photo." };
}

const STATUS_DONE: Record<ProjectStatus, string> = {
  published: "Published. Anyone with the link can see the visible photos.",
  draft: "Unpublished. The link has stopped working.",
  archived: "Archived.",
};

export async function setProjectStatus(projectId: string, to: ProjectStatus): Promise<FormState> {
  const { studio, project } = await managerProject(projectId);
  if (project.status === to) return { error: null };
  if (to === "published" && !canStartWork(accessFor(studio))) return { error: blockedMessage(accessFor(studio)) };

  const supabase = await createClient();
  const { error } = await supabase
    .from("projects")
    .update({ status: to })
    .eq("id", projectId)
    .eq("organization_id", studio.id)
    .eq("status", project.status);
  if (error) return { error: friendlyDbError(error) ?? "Couldn't change the project. Try again." };
  refresh();
  return { error: null, success: STATUS_DONE[to] };
}

/**
 * Replaces the gallery link with a new one, so an old link that was shared too
 * widely stops working. The database makes the new token; the value sent here
 * only asks for a change.
 */
export async function resetProjectLink(projectId: string): Promise<FormState> {
  const { studio } = await managerProject(projectId);
  const supabase = await createClient();
  const { error } = await supabase.from("projects").update({ access_token: "new" }).eq("id", projectId).eq("organization_id", studio.id);
  if (error) return { error: friendlyDbError(error) ?? "Couldn't make a new link. Try again." };
  refresh();
  return { error: null, success: "New link made. The old link no longer works." };
}

/** Removes every file in a project's folder. Uses the service role, after the caller is checked. */
async function removeProjectFiles(organizationId: string, projectId: string) {
  const bucket = createAdminClient().storage.from(PROJECT_BUCKET);
  const folder = `${organizationId}/${projectId}`;
  for (;;) {
    const { data, error } = await bucket.list(folder, { limit: 1000 });
    if (error || !data?.length) return;
    await bucket.remove(data.map((f) => `${folder}/${f.name}`));
    if (data.length < 1000) return;
  }
}

/** Deletes a project that has never been shared, with its photos. */
export async function deleteProject(projectId: string): Promise<FormState> {
  const { studio, project } = await managerProject(projectId);
  if (project.first_published_at) return { error: "A project that has been shared can't be deleted. Archive it instead." };

  const supabase = await createClient();
  const { error } = await supabase.from("projects").delete().eq("id", projectId).eq("organization_id", studio.id);
  if (error) return { error: friendlyDbError(error) ?? "Couldn't delete the project. Try again." };
  await removeProjectFiles(studio.id, projectId);
  redirect("/dashboard/projects");
}

/** File names already in the project, so the uploader can skip them. */
export async function existingFileNames(projectId: string): Promise<string[]> {
  const { project } = await memberProject(projectId);
  return projectFileNames(project.id);
}

/** Records one photo the browser has uploaded. Any studio member can upload. */
export async function saveProjectPhoto(projectId: string, input: NewProjectPhoto): Promise<RecordResult> {
  try {
    const { project } = await memberProject(projectId);
    const supabase = await createClient();
    const result = await recordProjectPhoto(supabase, createAdminClient(), project, input, "browser", friendlyDbError);
    return result;
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

/** Removes files the browser uploaded but couldn't record (it gave up). */
export async function discardUpload(projectId: string, photoId: string): Promise<void> {
  const { project } = await memberProject(projectId);
  if (!UUID_PATTERN.test(photoId)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("project_photos").select("id").eq("id", photoId).maybeSingle();
  if (data) return;
  const paths = projectPhotoPaths(project.organization_id, project.id, photoId);
  await createAdminClient().storage.from(PROJECT_BUCKET).remove([paths.full, paths.thumb, paths.editedFull, paths.editedThumb]);
}

function validIds(ids: unknown): ids is string[] {
  return Array.isArray(ids) && ids.length > 0 && ids.length <= 500 && ids.every((id) => typeof id === "string" && UUID_PATTERN.test(id));
}

export async function setPhotosHidden(projectId: string, photoIds: string[], hidden: boolean): Promise<FormState> {
  const { project } = await memberProject(projectId);
  if (!validIds(photoIds)) return { error: "Pick some photos first." };
  const supabase = await createClient();
  const { error } = await supabase.from("project_photos").update({ hidden }).eq("project_id", project.id).in("id", photoIds);
  if (error) return { error: friendlyDbError(error) ?? "Couldn't update the photos. Try again." };
  refresh();
  return { error: null };
}

export async function deletePhotos(projectId: string, photoIds: string[]): Promise<FormState> {
  const { project } = await managerProject(projectId);
  if (!validIds(photoIds)) return { error: "Pick some photos first." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("project_photos").delete().eq("project_id", project.id).in("id", photoIds).select("path, thumb_path, edited_path, edited_thumb_path");
  if (error) return { error: friendlyDbError(error) ?? "Couldn't delete the photos. Try again." };
  const paths = (data ?? []).flatMap((p) => [p.path, p.thumb_path, p.edited_path, p.edited_thumb_path].filter((x): x is string => typeof x === "string"));
  if (paths.length) await supabase.storage.from(PROJECT_BUCKET).remove(paths);
  refresh();
  return { error: null, success: `${data?.length ?? 0} photo${data?.length === 1 ? "" : "s"} deleted.` };
}

export async function loadProjectPhotos(projectId: string, offset: number): Promise<{ photos: ProjectPhoto[]; hasMore: boolean }> {
  const { project } = await memberProject(projectId);
  if (!Number.isInteger(offset) || offset < 0) return { photos: [], hasMore: false };
  return projectPhotoPage(await createClient(), project.id, offset);
}
