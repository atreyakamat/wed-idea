import { NextResponse, type NextRequest } from "next/server";
import { safeAppRedirect } from "@/lib/safe-redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Email confirmation lands here with ?code=. Exchange it for a session, then
 * continue to onboarding (or wherever ?next points inside the app).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const code = searchParams.get("code");
  const next = safeAppRedirect(searchParams.get("next"), "/onboarding");

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, origin));
  }

  return NextResponse.redirect(new URL("/login?error=link-expired", origin));
}
