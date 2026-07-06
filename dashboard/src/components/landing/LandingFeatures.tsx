import Image from "next/image";
import {
  DiscordMockup,
  MockButtons,
  MockEmbed,
  MockMessage,
} from "@/components/ui/DiscordMockup";
import { FeatureSplit } from "./FeatureSplit";

const CARDS = [
  { src: "/cards/starter_card.png", alt: "Starter card", rot: "-rotate-6" },
  { src: "/cards/gold_card.png", alt: "Gold card", rot: "-rotate-2" },
  { src: "/cards/platinum_card.png", alt: "Platinum card", rot: "rotate-2" },
  { src: "/cards/black_card.png", alt: "Black card", rot: "rotate-6" },
];

export function LandingFeatures() {
  return (
    <section className="border-y border-line bg-panel/40">
      <FeatureSplit
        eyebrow="The casino"
        title="Six games. Published odds. No mercy."
        body="Every payout table is public and every bet comes from your wallet — the bank can't save you and the credit card isn't allowed in the building."
        bullets={[
          "Blackjack pays 2.5x, dealer hits to 17",
          "Roulette single number pays x36",
          "Slots top out at 20x on triple sevens",
          "Russian roulette: 2–6 players, last one standing takes the pot",
        ]}
        media={
          <DiscordMockup>
            <MockMessage author="mara">
              <p className="font-mono">!bet 100000 red</p>
            </MockMessage>
            <MockMessage author="Lady Fortuna" isBot>
              <MockEmbed title="Roulette" accent="#e5484d">
                <p>
                  The ball lands on <strong>17 black</strong>.
                </p>
                <p className="mt-1 text-[#949ba4]">
                  100,000 to the house. Reds pay 2x. Numbers pay 36x.
                </p>
              </MockEmbed>
            </MockMessage>
          </DiscordMockup>
        }
      />

      <FeatureSplit
        flip
        eyebrow="Credit cards"
        title="Borrow like a king. Repay like clockwork."
        body="Four tiers from Starter to Black — real limits, weekly statements, and a credit score that remembers everything. Miss payments and the house garnishes a quarter of your income."
        bullets={[
          "Starter: 1.5M limit at 12% weekly",
          "Black: 60M limit at 3% — score 850 and a tier-4 career required",
          "Pay in full: +30 score. Miss: −45 and falling",
          "Cards can never fund gambling. House rules.",
        ]}
        media={
          <div className="flex items-center justify-center overflow-hidden py-6">
            {CARDS.map((c, i) => (
              <Image
                key={c.src}
                src={c.src}
                alt={c.alt}
                width={190}
                height={120}
                className={`${c.rot} ${i > 0 ? "-ml-7 sm:-ml-16" : ""} h-auto w-[86px] rounded-xl border border-line sm:w-[190px]`}
              />
            ))}
          </div>
        }
      />

      <FeatureSplit
        eyebrow="The life sim"
        title="Study. Work. Stress. Relax. Repeat."
        body="Eight degrees gate twenty-plus jobs across six sectors. Shifts pay up to 450,000 — and build stress you'll pay to burn off. It's capitalism with a dealer's smile."
        bullets={[
          "Degrees from 150k (High School) to 10M (MD/PhD)",
          "Careers from waiter to Chief of Medicine",
          "Stress is real: relax options from 25k to 350k",
          "8% income tax on wages. Nobody escapes it.",
        ]}
        media={
          <DiscordMockup>
            <MockMessage author="dev_ansh">
              <p className="font-mono">!work</p>
            </MockMessage>
            <MockMessage author="Lady Fortuna" isBot>
              <MockEmbed title="Shift complete — Senior Engineer" accent="#2f9e6e">
                <p>
                  You shipped on a Friday. Paid <strong>231,150</strong> after
                  tax.
                </p>
                <p className="mt-1 text-[#949ba4]">
                  Job stress +12 · try !relax before it costs you
                </p>
              </MockEmbed>
              <MockButtons
                buttons={[{ label: "View career", style: "secondary" }]}
              />
            </MockMessage>
          </DiscordMockup>
        }
      />
    </section>
  );
}
