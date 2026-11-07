import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { DocsShell } from "@/components/docs/DocsShell";
import { ModuleRenderer, moduleToc } from "@/components/docs/ModuleRenderer";
import { MODULE_DOCS, getModuleDoc } from "@/content/modules";

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
  return { title: `${doc.title} — Docs`, description: doc.tagline };
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
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <DocsShell current={doc.slug} toc={moduleToc(doc)}>
        <ModuleRenderer doc={doc} />
      </DocsShell>
      <Footer />
    </main>
  );
}
