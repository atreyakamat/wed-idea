import { NextResponse, type NextRequest } from "next/server";
import { GUEST_TOKEN_PATTERN } from "@/lib/capture/share";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Runs before matching routes render.
 *
 * - /g/<token>: malformed gallery links get a real 404 before any page work.
 * - /dashboard, /onboarding and /admin: refreshes the Supabase session and sends
 *   signed-out visitors to the login page. This is only a fast first gate;
 *   every page and Server Action checks the user and their studio role itself
 *   (src/lib/auth.ts).
 * - /admin: signed-in sessions without two-step sign-in go to /admin/mfa,
 *   keeping the page they asked for. Again only a first gate: requireAdmin()
 *   and the database's is_admin() decide who is actually an admin.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith("/g/")) {
    const token = pathname.slice(3);
    if (!GUEST_TOKEN_PATTERN.test(token)) {
      return new NextResponse("Not found", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
    }
    return NextResponse.next();
  }

  const { response, isSignedIn, hasMfa } = await updateSession(request);

  if (!isSignedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  const isAdminPage = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdminPage && !hasMfa && !pathname.startsWith("/admin/mfa")) {
    const mfaUrl = new URL("/admin/mfa", request.url);
    mfaUrl.searchParams.set("next", pathname + search);
    const redirect = NextResponse.redirect(mfaUrl);
    // Keep any refreshed session cookies on the redirect.
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/admin/:path*", "/g/:path*"],
};
