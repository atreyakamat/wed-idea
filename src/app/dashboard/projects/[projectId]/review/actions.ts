"use server";

import { requireStudio } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { getProject } from "@/lib/projects/queries";
import { applyEditChoice, markReviewed, reviewLinks, saveChecks, type EditChoice, type ReviewLinks } from "@/lib/projects/review";
import { accessFor, blockedMessage, canStartWork } from "@/lib/studio/status";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type Result = { error: string | null };

/** The signed-in member's project, and whether the studio may change it. */
async function memberProject(projectId: string) {
  const { studio } = await requireStudio();
  if (!UUID_PATTERN.test(projectId)) throw new Error("Project not found.");
  const project = await getProject(studio.id, projectId);
  if (!project) throw new Error("Project not found.");
  const access = accessFor(studio);
  return { project, blocked: canStartWork(access) ? null : (blockedMessage(access) ?? "Your studio can't make changes right now.") };
}

export async function loadReviewLinks(projectId: string, photoIds: string[]): Promise<ReviewLinks[]> {
  const { project } = await memberProject(projectId);
  if (!Array.isArray(photoIds)) return [];
  return reviewLinks(await createClient(), project.id, photoIds);
}

/** Saves a photo's new look (its files are already uploaded), or puts it back to the plain photo. */
export async function saveEdit(projectId: string, photoId: string, choice: EditChoice): Promise<Result> {
  try {
    const { project, blocked } = await memberProject(projectId);
    if (blocked) return { error: blocked };
    if (project.status === "archived") return { error: "This project is archived. Restore it to edit photos." };
    return { error: await applyEditChoice(createAdminClient(), project, photoId, choice) };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function setReviewed(projectId: string, photoIds: string[], reviewed: boolean): Promise<Result> {
  try {
    const { project, blocked } = await memberProject(projectId);
    if (blocked) return { error: blocked };
    if (!Array.isArray(photoIds)) return { error: "Pick some photos first." };
    await markReviewed(createAdminClient(), project, photoIds, reviewed);
    return { error: null };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Hides or shows one photo in the gallery (members may change this directly). */
export async function setHidden(projectId: string, photoId: string, hidden: boolean): Promise<Result> {
  const { project } = await memberProject(projectId);
  if (!UUID_PATTERN.test(photoId)) return { error: "Photo not found." };
  const { error } = await (await createClient()).from("project_photos").update({ hidden }).eq("project_id", project.id).eq("id", photoId);
  return { error: error ? "Couldn't update the photo. Try again." : null };
}

/** Saves the missed-shot checks the browser worked out. */
export async function saveShotChecks(projectId: string, checks: { photoId: string; check: unknown }[]): Promise<Result> {
  const { project } = await memberProject(projectId);
  if (!Array.isArray(checks)) return { error: "Nothing to save." };
  await saveChecks(createAdminClient(), project.id, checks);
  return { error: null };
}

/** Hides (or shows) several photos at once. */
export async function setManyHidden(projectId: string, photoIds: string[], hidden: boolean): Promise<Result> {
  const { project } = await memberProject(projectId);
  const ids = Array.isArray(photoIds) ? photoIds.filter((id) => typeof id === "string" && UUID_PATTERN.test(id)).slice(0, 2000) : [];
  if (!ids.length) return { error: "Pick some photos first." };
  const supabase = await createClient();
  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await supabase.from("project_photos").update({ hidden }).eq("project_id", project.id).in("id", ids.slice(i, i + 200));
    if (error) return { error: "Couldn't update the photos. Try again." };
  }
  return { error: null };
}
