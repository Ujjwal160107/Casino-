import type { Metadata } from "next";
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Container } from "@/components/landing/kit";
import { NEW_MODULE } from "@/components/docs/DocsSidebar";
import { PaletteProvider } from "@/components/docs/palette/PaletteProvider";
import { SearchButton } from "@/components/docs/palette/SearchButton";
import { buildSearchIndex } from "@/components/docs/palette/search-index";
import { MODULE_DOCS } from "@/content/modules";
import { COMMANDS } from "@/content/commands";
import type { ModuleDoc } from "@/content/types";
import { cn } from "@/lib/utils";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/lib/seo/metadata";

export const metadata: Metadata = pageMetadata({
  title: "Docs: How Every System Works, With Real Numbers",
  description: `Every Fortuna system with its real numbers: the odds, prices, taxes and cooldowns. ${MODULE_DOCS.length} modules and ${COMMANDS.length} commands, all searchable.`,
  path: "/docs",
});

const card =
  "group flex h-full flex-col gap-3 rounded-[18px] border-[3px] p-8 transition-[translate,box-shadow] duration-200 hover:-translate-x-0.5 hover:-translate-y-0.5";

function ModuleCard({ doc, label }: { doc: ModuleDoc; label?: string }) {
  const featured = doc.slug === NEW_MODULE;
  return (
    <Link
      href={`/docs/${doc.slug}`}
      className={cn(
        card,
        featured
          ? "border-gold bg-gold text-bg shadow-[6px_6px_0_var(--color-ink)] hover:shadow-[8px_8px_0_var(--color-ink)]"
          : "border-ink bg-panel hover:shadow-[6px_6px_0_var(--color-gold)]",
      )}
    >
      {featured ? (
        <span className="w-fit rounded-full bg-bg px-2.5 py-0.5 font-mono text-[11px] font-bold tracking-[.12em] text-gold">NEW</span>
      ) : (
        label && <span className="font-mono text-xs font-bold uppercase tracking-[.14em] text-gold">{label}</span>
      )}
      <h2 className={cn("font-display font-black uppercase leading-[.9]", featured ? "text-[clamp(44px,5vw,72px)]" : "text-4xl")}>
        {doc.title}
      </h2>
      <p className={cn("max-w-[52ch]", featured ? "text-lg font-medium text-bg" : "text-ink-2")}>{doc.tagline}</p>
      <p className={cn("mt-auto flex flex-wrap gap-x-3 gap-y-1 pt-2 font-mono text-[13px] font-bold", featured ? "text-bg" : "text-gold")}>
        <span className="sr-only">First commands:</span>
        {doc.forBeginners.firstCommands.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </p>
    </Link>
  );
}

export default async function DocsHub() {
  const session = await getServerSession(authOptions);
  const [starter, ...rest] = MODULE_DOCS;
  const featured = rest.find((m) => m.slug === NEW_MODULE);
  const others = rest.filter((m) => m !== featured);

  return (
    <div className="min-h-screen bg-bg">
      <JsonLd />
      <LandingNavbar user={session?.user} />
      <PaletteProvider items={buildSearchIndex()}>
        <Container className="pb-[var(--section-y)] pt-16">
          <main id="main" tabIndex={-1} className="focus:outline-none!">
            <header className="grid gap-8 border-b-[3px] border-ink pb-12">
              <p className="font-mono text-[13px] font-bold uppercase tracking-[.16em] text-muted">
                {MODULE_DOCS.length} modules · {COMMANDS.length} commands
              </p>
              <h1 className="font-display text-[clamp(96px,16vw,220px)] font-black uppercase leading-[.8]">Docs</h1>
              <p className="max-w-[56ch] text-lg text-ink-2">
                Every Fortuna system with its real numbers: the odds, the prices, the taxes and the cooldowns. Search for a
                command or a topic, or pick a module below.
              </p>
              <SearchButton variant="field" className="max-w-2xl" />
            </header>

            <ul className="mt-16 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured && (
                <li className="sm:col-span-2">
                  <ModuleCard doc={featured} />
                </li>
              )}
              <li>
                <ModuleCard doc={starter} label="Start here" />
              </li>
              {others.map((m) => (
                <li key={m.slug}>
                  <ModuleCard doc={m} />
                </li>
              ))}
              <li>
                <Link href="/commands" className={cn(card, "border-ink bg-panel hover:shadow-[6px_6px_0_var(--color-gold)]")}>
                  <span className="font-mono text-xs font-bold uppercase tracking-[.14em] text-gold">Reference</span>
                  <h2 className="font-display text-4xl font-black uppercase leading-[.9]">All commands</h2>
                  <p className="text-ink-2">
                    All {COMMANDS.length} commands with usage, cooldowns and key numbers, grouped by module.
                  </p>
                </Link>
              </li>
            </ul>
          </main>
        </Container>
      </PaletteProvider>
      <Footer />
    </div>
  );
}
