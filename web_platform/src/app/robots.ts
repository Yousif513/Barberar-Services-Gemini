import { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "https://primora.sa";

  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/discover", "/categories/*", "/shop/*", "/about", "/privacy", "/terms", "/become-provider"],
        disallow: ["/admin/*", "/provider/*", "/customer/*", "/api/*"]
      }
    ],
    sitemap: `${baseUrl}/sitemap.xml`
  };
}
