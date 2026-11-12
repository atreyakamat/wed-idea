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
