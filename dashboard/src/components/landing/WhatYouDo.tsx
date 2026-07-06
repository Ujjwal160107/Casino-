import { Panel } from "@/components/ui/Panel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { FadeUp } from "@/components/ui/FadeUp";
import { Briefcase, CreditCard, Dice5, Swords } from "lucide-react";

const CELLS = [
  {
    icon: Dice5,
    color: "text-gold",
    title: "Bet",
    body: "Blackjack, roulette, slots, coinflip, cockfights, and Russian roulette. Real payout tables, real cooldowns, wallet-only stakes.",
  },
  {
    icon: Briefcase,
    color: "text-felt",
    title: "Earn",
    body: "Apply for jobs, clock shifts, study for degrees, climb from waiter to Chief of Medicine. The paycheck grows with the title.",
  },
  {
    icon: CreditCard,
    color: "text-card-blue",
    title: "Borrow",
    body: "Four credit card tiers with weekly statements. Pay on time and your score climbs. Miss, and the house garnishes your wages.",
  },
  {
    icon: Swords,
    color: "text-chip",
    title: "Compete",
    body: "Rob wallets, top leaderboards, marry rich, and settle scores in quests. Every server is the same economy — nobody escapes it.",
  },
];

export function WhatYouDo() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeader
        eyebrow="The pitch"
        title="So what do you actually do?"
        sub="It's a life sim wearing a casino's suit. Four ways in, no way out."
      />
      <FadeUp>
        <Panel className="grid gap-px overflow-hidden bg-line sm:grid-cols-2">
          {CELLS.map((c) => (
            <div key={c.title} className="bg-panel p-8">
              <c.icon size={22} className={c.color} />
              <h3 className="mt-3 font-display text-xl font-bold text-ink">
                {c.title}
              </h3>
              <p className="mt-2 leading-relaxed text-muted">{c.body}</p>
            </div>
          ))}
        </Panel>
      </FadeUp>
    </section>
  );
}
