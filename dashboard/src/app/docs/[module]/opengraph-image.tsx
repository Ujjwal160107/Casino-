import { notFound } from "next/navigation";
import { MODULE_DOCS, getModuleDoc } from "@/content/modules";
import { renderOgCard } from "@/lib/seo/og-card";
import { OG_SIZE, clip } from "@/lib/seo/metadata";
import { modulePath } from "@/lib/seo/docs";

export const alt = "A Fortuna docs module";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return MODULE_DOCS.map((m) => ({ module: m.slug }));
}

export default async function Image({ params }: { params: Promise<{ module: string }> }) {
  const doc = getModuleDoc((await params).module);
  if (!doc) notFound();
  return renderOgCard({
    eyebrow: "Fortuna docs",
    title: doc.title,
    tagline: clip(doc.tagline, 110),
    pagePath: modulePath(doc),
  });
}
