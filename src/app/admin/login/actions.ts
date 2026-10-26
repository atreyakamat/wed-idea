"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeAdminRedirect } from "@/lib/safe-redirect";

export type LoginState = { error: string | null; email: string };

const credentials = z.object({
  email: z.email(),
  password: z.string().min(8).max(200),
});

export async function signIn(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const parsed = credentials.safeParse({
    email,
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and a password of at least 8 characters.", email };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Same message for every failure so the form doesn't reveal which
    // emails have accounts.
    return { error: "That email and password don't match an admin account.", email };
  }

  redirect(safeAdminRedirect(formData.get("next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/admin/login");
}
