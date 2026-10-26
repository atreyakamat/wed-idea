"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/components/ui/form";
import { listStudios, requireUser } from "@/lib/auth";
import { slugify } from "@/lib/domain/slug";
import { createClient } from "@/lib/supabase/server";

const studioSchema = z.object({
  name: z.string().trim().min(2, "Give your studio a name").max(80),
  slug: z
    .string()
    .min(3, "Use at least 3 letters or numbers")
    .max(40, "Keep it under 40 characters")
    .regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes"),
});

export async function createStudio(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser("/onboarding");
  if ((await listStudios(user.id)).length > 0) redirect("/dashboard");

  const name = String(formData.get("name") ?? "");
  const rawSlug = String(formData.get("slug") ?? "").trim();
  const slug = rawSlug ? rawSlug.toLowerCase() : slugify(name).slice(0, 40).replace(/-+$/, "");
  const values = { name, slug: rawSlug };

  const parsed = studioSchema.safeParse({ name, slug });
  if (!parsed.success) {
    const fieldErrors = Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message]));
    return { error: null, fieldErrors, values };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_organization", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) {
    if (error.code === "23505") {
      return { error: null, fieldErrors: { slug: "That studio link is taken. Try another." }, values };
    }
    return { error: "Couldn't create your studio. Try again.", values };
  }

  redirect("/dashboard");
}
