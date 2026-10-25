import "server-only";
import { z } from "zod";
import { parseOrThrow } from "./env";

// Server-only secrets. Importing this file from a Client Component fails the
// build, so the service-role key can never ship to a browser.
const serverSchema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(1),
});

let cached: z.infer<typeof serverSchema> | undefined;

export function serverEnv() {
  cached ??= parseOrThrow(serverSchema, {
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  });
  return cached;
}
