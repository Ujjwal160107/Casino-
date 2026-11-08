import type { MetadataRoute } from "next";
import { MODULE_DOCS } from "@/content/modules";
import { CONTENT_UPDATED, LEGAL_EFFECTIVE, absoluteUrl } from "@/lib/site";
import { modulePath } from "@/lib/seo/docs";

export default function sitemap(): MetadataRoute.Sitemap {
  const page = (
    path: string,
    priority: number,
    changeFrequency: "weekly" | "monthly" | "yearly",
    lastModified = CONTENT_UPDATED,
  ) => ({ url: absoluteUrl(path), lastModified, changeFrequency, priority });

  return [
    page("/", 1, "weekly"),
    page("/docs", 0.9, "weekly"),
    ...MODULE_DOCS.map((m) => page(modulePath(m), 0.8, "monthly")),
    page("/commands", 0.8, "weekly"),
    page("/changelog", 0.6, "weekly"),
    page("/terms", 0.2, "yearly", LEGAL_EFFECTIVE),
    page("/policy", 0.2, "yearly", LEGAL_EFFECTIVE),
  ];
}
