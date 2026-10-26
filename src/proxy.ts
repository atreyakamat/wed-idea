import { NextResponse, type NextRequest } from "next/server";
import { GUEST_TOKEN_PATTERN } from "@/lib/capture/share";
import { updateSession } from "@/lib/supabase/proxy-session";

/**
 * Runs before matching routes render.
 *
 * - /g/<token>: malformed gallery links get a real 404 before any page work.
 * - /dashboard and /onboarding: refreshes the Supabase session and sends
 *   signed-out visitors to the login page. This is only a fast first gate;
 *   every page and Server Action checks the user and their studio role itself
 *   (src/lib/auth.ts).
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

  const { response, isSignedIn } = await updateSession(request);

  if (!isSignedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname + search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ["/dashboard/:path*", "/onboarding", "/g/:path*"],
};
