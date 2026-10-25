import { z } from "zod";

// Public values are safe in the browser. The publishable (anon) key only
// works within the database's RLS rules.
const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_SITE_URL: z.url(),
});

export type PublicEnv = z.infer<typeof publicSchema>;

let cachedPublic: PublicEnv | undefined;

export function publicEnv(): PublicEnv {
  // Next.js inlines NEXT_PUBLIC_* only when accessed by their full name.
  cachedPublic ??= parseOrThrow(publicSchema, {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  });
  return cachedPublic;
}

export function parseOrThrow<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);
  if (!result.success) {
    const missing = result.error.issues
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new Error(
      `Missing or invalid environment variables: ${missing}. See .env.example.`,
    );
  }
  return result.data;
}
