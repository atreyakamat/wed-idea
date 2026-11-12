import type { MetadataRoute } from "next";

// Private pages (galleries, dashboards) also send noindex themselves; this
// keeps well-behaved crawlers away from them in the first place.
export default function robots(): MetadataRoute.Robots {
  const site = (process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000").replace(/\/+$/, "");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/p/", "/g/", "/dashboard", "/admin", "/api/", "/onboarding", "/auth/", "/reset-password"] },
    sitemap: `${site}/sitemap.xml`,
  };
}
