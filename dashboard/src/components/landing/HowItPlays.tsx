import { Container, Reveal, Section, SectionHead } from "@/components/landing/kit";
import { cardTierFacts, deedFacts, workShiftFacts } from "./tiles/content";
import { CreditCardTile } from "./tiles/CreditCardTile";
import { FeedZooTile } from "./tiles/FeedZooTile";
import { HeistCrewTile } from "./tiles/HeistCrewTile";
import { LiveStockTile } from "./tiles/LiveStockTile";
import { PropertyTile } from "./tiles/PropertyTile";
import { WorkShiftTile } from "./tiles/WorkShiftTile";

/**
 * "How it plays": a 12-column bento of small working demos, one system each.
 * A server component: it reads the tiles' numbers from the module docs and
 * hands the client tiles plain props. Delays stagger tiles by their place in the row.
 */
export function HowItPlays() {
  return (
    <Section id="how-it-plays">
      <Container>
        <SectionHead num="02" title={<>How it <em>plays.</em></>} sub="A look at the systems you run in Discord." />
        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <Reveal className="md:col-span-6 lg:col-span-7" delay={0}><WorkShiftTile {...workShiftFacts()} /></Reveal>
          <Reveal className="md:col-span-6 lg:col-span-5" delay={70}><FeedZooTile /></Reveal>
          <Reveal className="md:col-span-6 lg:col-span-4" delay={0}><CreditCardTile tiers={cardTierFacts()} /></Reveal>
          <Reveal className="md:col-span-6 lg:col-span-8" delay={70}><LiveStockTile /></Reveal>
          <Reveal className="md:col-span-6 lg:col-span-5" delay={0}><PropertyTile deeds={deedFacts()} /></Reveal>
          <Reveal className="md:col-span-6 lg:col-span-7" delay={70}><HeistCrewTile /></Reveal>
        </div>
      </Container>
    </Section>
  );
}
