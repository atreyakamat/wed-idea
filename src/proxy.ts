import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy-session";

const LOGIN_PATH = "/admin/login";

/**
 * Refreshes the Supabase session on admin routes and sends signed-out
 * visitors to the login page. This is a fast first gate only: every admin
 * page and Server Action still checks the admin role itself (src/lib/auth.ts).
 */
export async function proxy(request: NextRequest) {
  const { response, isSignedIn } = await updateSession(request);
  const { pathname } = request.nextUrl;

  if (!isSignedIn && pathname !== LOGIN_PATH) {
    const loginUrl = new URL(LOGIN_PATH, request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/admin/:path*"],
};
