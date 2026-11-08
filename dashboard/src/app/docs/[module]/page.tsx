import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { DocsShell } from "@/components/docs/DocsShell";
import { ModuleRenderer, moduleToc } from "@/components/docs/ModuleRenderer";
import { MODULE_DOCS, getModuleDoc } from "@/content/modules";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/lib/seo/metadata";
import { moduleDescription, moduleOgImage, modulePath, moduleTitle } from "@/lib/seo/docs";
import { breadcrumbNode, techArticleNode } from "@/lib/seo/json-ld";

export function generateStaticParams() {
  return MODULE_DOCS.map((m) => ({ module: m.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ module: string }>;
}): Promise<Metadata> {
  const { module } = await params;
  const doc = getModuleDoc(module);
  if (!doc) return {};
  return pageMetadata({
    title: moduleTitle(doc),
    description: moduleDescription(doc),
    path: modulePath(doc),
    image: moduleOgImage(doc),
    imageAlt: `${doc.title}: the Fortuna docs`,
    type: "article",
  });
}

export default async function ModulePage({
  params,
}: {
  params: Promise<{ module: string }>;
}) {
  const { module } = await params;
  const doc = getModuleDoc(module);
  if (!doc) notFound();

  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-bg">
      <JsonLd
        nodes={[
          breadcrumbNode([
            { name: "Docs", path: "/docs" },
            { name: doc.title, path: modulePath(doc) },
          ]),
          techArticleNode(doc),
        ]}
      />
      <LandingNavbar user={session?.user} />
      <DocsShell current={doc.slug} toc={moduleToc(doc)}>
        <ModuleRenderer doc={doc} />
      </DocsShell>
      <Footer />
    </div>
  );
}
