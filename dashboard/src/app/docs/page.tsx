import type { Metadata } from "next";
import Link from "next/link";
import * as icons from "lucide-react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { Panel } from "@/components/ui/Panel";
import { MODULE_DOCS } from "@/content/modules";

export const metadata: Metadata = {
  title: "Docs",
  description:
    "How Fortuna works — every system explained, from your first 1,000 Fortunes to your first missed credit card payment.",
};

function CardIcon({ name }: { name: string }) {
  const Icon =
    (icons as unknown as Record<string, icons.LucideIcon>)[name] ??
    icons.BookOpen;
  return <Icon className="h-6 w-6 text-gold" />;
}

export default async function DocsHub() {
  const session = await getServerSession(authOptions);
  const [starter, ...rest] = MODULE_DOCS;

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <div className="mx-auto max-w-6xl px-6 pb-24 pt-16">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          Know the house. Beat the house.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Every Fortuna system, documented — the odds, the prices, the taxes,
          and the fine print the dealer reads fast.
        </p>

        <Link href={`/docs/${starter.slug}`} className="mt-10 block">
          <Panel className="border-gold/40 p-8 transition-colors hover:border-gold">
            <p className="font-mono text-sm font-medium uppercase tracking-widest text-gold">
              Start here
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold text-ink">
              {starter.title}
            </h2>
            <p className="mt-2 max-w-xl text-muted">{starter.tagline}</p>
          </Panel>
        </Link>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rest.map((m) => (
            <Link key={m.slug} href={`/docs/${m.slug}`}>
              <Panel className="h-full p-6 transition-colors hover:border-gold/40">
                <CardIcon name={m.icon} />
                <h2 className="mt-3 font-display text-lg font-bold text-ink">
                  {m.title}
                </h2>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  {m.tagline}
                </p>
              </Panel>
            </Link>
          ))}
        </div>
      </div>
      <Footer />
    </main>
  );
}
