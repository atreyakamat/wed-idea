"use server";

import { refresh } from "next/cache";
import type { FormState } from "@/components/ui/form";
import { requireStudioManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

const LOGO_PATH_PATTERN = /^[0-9a-f-]{36}\/logo-[0-9a-f]{8,32}\.(png|jpg|webp)$/;

/** Saves the logo the browser just uploaded and removes the old one. */
export async function setStudioLogo(path: string | null): Promise<FormState> {
  const { studio } = await requireStudioManager();
  if (path !== null && (!LOGO_PATH_PATTERN.test(path) || !path.startsWith(`${studio.id}/`))) return { error: "That logo upload didn't work. Try again." };

  const supabase = await createClient();
  const { data: current } = await supabase.from("organizations").select("logo_path").eq("id", studio.id).single();
  const { error } = await supabase.from("organizations").update({ logo_path: path }).eq("id", studio.id);
  if (error) return { error: "Couldn't save the logo. Try again." };
  const old = current?.logo_path as string | null | undefined;
  if (old && old !== path) await supabase.storage.from("studio-assets").remove([old]);
  refresh();
  return { error: null, success: path ? "Logo saved. It now shows on your galleries." : "Logo removed." };
}

const LIGHTS = ["daylight", "golden", "indoor", "stage", "night"] as const;
const LOOK_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Sets (or, with a null look, clears) the default look for one kind of light. */
export async function setLookDefault(lighting: string, look: string | null): Promise<FormState> {
  const { studio } = await requireStudioManager();
  if (!(LIGHTS as readonly string[]).includes(lighting)) return { error: "Unknown kind of light." };
  if (look !== null && (!LOOK_ID.test(look) || look.length > 40)) return { error: "Unknown look." };

  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { error } =
    look === null
      ? await supabase.from("studio_look_defaults").delete().eq("organization_id", studio.id).eq("lighting", lighting)
      : await supabase
          .from("studio_look_defaults")
          .upsert({ organization_id: studio.id, lighting, look, updated_at: new Date().toISOString(), updated_by: user.user?.id ?? null }, { onConflict: "organization_id,lighting" });
  if (error) return { error: "Couldn't save that look. Try again." };
  refresh();
  return { error: null, success: look ? "Saved. New photos in that light use this look." : "Cleared. New photos in that light use your learnt look." };
}

/** Forgets the looks the studio has picked, so new photos start from the standard looks again. */
export async function resetStudioStyle(): Promise<FormState> {
  const { studio } = await requireStudioManager();
  const supabase = await createClient();
  const { error } = await supabase.from("studio_look_picks").delete().eq("organization_id", studio.id);
  if (error) return { error: "Couldn't reset your style. Try again." };
  refresh();
  return { error: null, success: "Style reset. New photos start from the standard looks." };
}
