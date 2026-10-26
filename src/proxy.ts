import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Refreshes the Supabase session on app routes and sends signed-out visitors
 * to the login page. This is a fast first gate only: every page and Server
 * Action checks the user and their studio role itself (src/lib/auth.ts).
 */
export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await updateSession(request);

  if (!isSignedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", request.nextUrl.pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding"],
};
