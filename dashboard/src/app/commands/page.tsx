import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { LandingNavbar } from "@/components/LandingNavbar";
import { Footer } from "@/components/Footer";
import { DocsShell } from "@/components/docs/DocsShell";
import { DocsPageHeader } from "@/components/docs/DocsPageHeader";
import { CommandsExplorer } from "@/components/commands/CommandsExplorer";
import { commandGroupId } from "@/components/docs/anchors";
import { COMMANDS, MODULE_LABELS } from "@/content/commands";
import type { ModuleId } from "@/content/types";
import { JsonLd } from "@/components/seo/JsonLd";
import { pageMetadata } from "@/lib/seo/metadata";
import { breadcrumbNode, commandTermSetNode } from "@/lib/seo/json-ld";

export const metadata: Metadata = pageMetadata({
  title: "All Commands: Full Discord Bot Reference",
  description: `All ${COMMANDS.length} Fortuna commands with usage, examples, cooldowns, payouts and aliases, grouped by module. The default prefix is ! and servers can change it.`,
  path: "/commands",
});

const GROUPS = (Object.keys(MODULE_LABELS) as ModuleId[]).map((m) => ({
  id: commandGroupId(m),
  label: MODULE_LABELS[m],
}));

export default async function CommandsPage() {
  const session = await getServerSession(authOptions);

  return (
    <div className="min-h-screen bg-bg">
      <JsonLd
        nodes={[
          breadcrumbNode([
            { name: "Docs", path: "/docs" },
            { name: "All commands", path: "/commands" },
          ]),
          commandTermSetNode(COMMANDS),
        ]}
      />
      <LandingNavbar user={session?.user} />
      <DocsShell current="commands" toc={GROUPS} tocTitle="Groups">
        <DocsPageHeader
          title="All commands"
          tagline={
            <>
              {COMMANDS.length} commands with usage, cooldowns and key numbers. The default prefix is{" "}
              <code className="font-mono font-bold text-gold">!</code> (servers can change it).
            </>
          }
        />
        <CommandsExplorer commands={COMMANDS} />
      </DocsShell>
      <Footer />
    </div>
  );
}
