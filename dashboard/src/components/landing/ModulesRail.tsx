import Link from "next/link";
import { Container, Section, SectionHead } from "@/components/landing/kit";
import { getModuleDoc, MODULE_DOCS } from "@/content/modules";
import { ModulesRailColumns, type RailModule } from "./ModulesRailColumns";

/**
 * "The modules": eight headline systems as an expanding rail. A server
 * component, so the module docs (large) stay on the server: it reads each
 * tagline here and hands the client rail plain props.
 */

type RailEntry = Omit<RailModule, "tagline">;

const MODULES: RailEntry[] = [
  { slug: "jobs-and-careers", title: "Jobs & Careers", art: "/art/business-briefcase.webp", cmds: ["!apply", "!work", "!career"] },
  { slug: "bank-and-credit", title: "Bank & Credit", art: "/cards/gold_card_face.webp", cmds: ["!bank", "!card", "!credit"] },
  { slug: "casino", title: "Casino", art: "/art/dice.png", cmds: ["!slots", "!blackjack", "!coinflip"] },
  { slug: "education", title: "Education", art: "/art/scholarship-letter.webp", cmds: ["!enroll", "!study", "!exam"] },
  { slug: "hunting-and-animals", title: "Hunting & Zoo", art: "/art/white-tiger.webp", cmds: ["!hunt", "!zoo"] },
  { slug: "investments", title: "Investments", art: "/art/stock-market.jpg", photo: true, cmds: ["!stock", "!buy-property"] },
  { slug: "life-and-social", title: "Life & Social", art: "/art/daily-quest.webp", cmds: ["!marry", "!quests"] },
  { slug: "crime-families", title: "Crime Families", art: "/cf/cf_war_banner.webp", cmds: ["!crew", "!heist", "!turf"], isNew: true },
];

/** Docs taglines use em-dash asides; on the landing page they read as plain sentences. */
function plainTagline(s: string) {
  return s.replace(/\s+—\s+(\w+)/g, (_, word: string) =>
    /^(and|but|or)$/i.test(word) ? `, ${word.toLowerCase()}` : `. ${word.charAt(0).toUpperCase()}${word.slice(1)}`,
  );
}

function railModules(): RailModule[] {
  return MODULES.map((m) => {
    const doc = getModuleDoc(m.slug);
    if (!doc) throw new Error(`ModulesRail: no module doc for ${m.slug}`);
    return { ...m, tagline: plainTagline(doc.tagline) };
  });
}

export function ModulesRail() {
  return (
    <Section id="modules">
      <Container>
        <SectionHead num="01" title={<>The <em>modules.</em></>} sub="The biggest systems, all on one wallet. Open one to see what it does." />
        <ModulesRailColumns modules={railModules()} />
        <p className="mt-8 text-muted">
          Plus Crime &amp; Heat, Items &amp; Shop and Chickens.{" "}
          <Link href="/docs" className="border-b-2 border-gold text-ink">
            All {MODULE_DOCS.length} modules in the docs →
          </Link>
        </p>
      </Container>
    </Section>
  );
}
