"use server";

import { refresh } from "next/cache";
import { requireStudioManager } from "@/lib/auth";
import { UUID_PATTERN } from "@/lib/capture/photos";
import { formText } from "@/lib/form-data";
import { makeWorkerToken } from "@/lib/projects/worker-token";
import { friendlyDbError } from "@/lib/studio/status";
import { createClient } from "@/lib/supabase/server";

export type ConnectState = { error: string | null; token?: string; name?: string };

/** Makes a token for a new computer. It is returned once and never stored. */
export async function connectComputer(_prev: ConnectState, formData: FormData): Promise<ConnectState> {
  const { studio } = await requireStudioManager();
  const name = formText(formData, "name");
  if (!name || name.length > 60) return { error: "Name the computer in 1 to 60 characters, like “Studio iMac”." };

  const { token, hash, hint } = makeWorkerToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_worker_token", { p_org: studio.id, p_name: name, p_hash: hash, p_hint: hint });
  if (error) return { error: friendlyDbError(error) ?? "Couldn't connect the computer. Try again." };
  refresh();
  return { error: null, token, name };
}

export async function disconnectComputer(tokenId: string): Promise<{ error: string | null }> {
  await requireStudioManager();
  if (!UUID_PATTERN.test(tokenId)) return { error: "Unknown computer." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_worker_token", { p_token: tokenId });
  if (error) return { error: friendlyDbError(error) ?? "Couldn't disconnect it. Try again." };
  refresh();
  return { error: null };
}
