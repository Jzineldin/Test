import type { MetadataRoute } from "next";

const SITE_URL = "https://appetitematch.com";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Authenticated dashboard surfaces don't belong in search.
        disallow: ["/app", "/app/", "/login/verify"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
