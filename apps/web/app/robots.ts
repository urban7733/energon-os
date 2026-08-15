import type { MetadataRoute } from "next";
import { site } from "../lib/site";

export const dynamic = "force-static";

const publicCrawlerRules = {
  allow: "/",
  disallow: ["/api/", "/dashboard", "/login"],
};

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        ...publicCrawlerRules,
      },
      { userAgent: "Googlebot", ...publicCrawlerRules },
      { userAgent: "GPTBot", ...publicCrawlerRules },
      { userAgent: "OAI-SearchBot", ...publicCrawlerRules },
      { userAgent: "ChatGPT-User", ...publicCrawlerRules },
      { userAgent: "ClaudeBot", ...publicCrawlerRules },
      { userAgent: "Claude-SearchBot", ...publicCrawlerRules },
      { userAgent: "PerplexityBot", ...publicCrawlerRules },
    ],
    sitemap: `${site.url}/sitemap.xml`,
    host: site.url,
  };
}
