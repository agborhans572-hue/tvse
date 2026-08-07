import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/staff/", "/business/", "/partner/", "/portal/", "/search"] },
    sitemap: "https://tvse-travel.agborhans572.chatgpt.site/sitemap.xml",
  };
}
