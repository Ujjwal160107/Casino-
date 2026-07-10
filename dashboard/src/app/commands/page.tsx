import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { CommandsExplorer } from "@/components/commands/CommandsExplorer";
import { COMMANDS } from "@/content/commands";

export const metadata: Metadata = {
  title: "Commands",
  description:
    "Every Fortuna command — usage, examples, cooldowns, payouts, and aliases. The whole deck, face up.",
};

export default async function CommandsPage() {
  const session = await getServerSession(authOptions);

  return (
    <main className="min-h-screen bg-bg">
      <LandingNavbar user={session?.user} />
      <div className="mx-auto max-w-5xl px-6 pb-24 pt-16">
        <h1 className="font-display text-4xl font-extrabold tracking-tight text-ink md:text-5xl">
          The whole deck, face up.
        </h1>
        <p className="mt-3 max-w-2xl text-lg text-muted">
          Every command Fortuna answers to — {COMMANDS.length} of them, with
          usage, cooldowns, and the numbers behind each one. Default prefix is{" "}
          <span className="font-mono text-ink">!</span> (servers can change
          it).
        </p>
        <div className="mt-10">
          <CommandsExplorer commands={COMMANDS} />
        </div>
      </div>
      <Footer />
    </main>
  );
}
