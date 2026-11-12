import { NextResponse } from "next/server";
import { isCronRequest, runCleanup } from "@/lib/cleanup";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Daily storage clean-up. Called by the scheduled GitHub Action
 * (.github/workflows/cleanup.yml) with "Authorization: Bearer $CRON_SECRET".
 */
export async function POST(request: Request) {
  if (!process.env.CRON_SECRET) return NextResponse.json({ error: "Clean-up isn't set up: CRON_SECRET is missing." }, { status: 503 });
  if (!isCronRequest(request.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  }
  const report = await runCleanup(createAdminClient());
  return NextResponse.json(report, { status: report.errors.length ? 500 : 200, headers: { "Cache-Control": "no-store" } });
}
