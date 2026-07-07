import Image from "next/image";
import {
  DiscordMockup,
  MockButtons,
  MockEmbed,
  MockMessage,
} from "@/components/ui/DiscordMockup";
import { FeatureSplit } from "./FeatureSplit";

const CARDS = [
  { src: "/cards/starter_card.png", alt: "Starter card", rot: "-rotate-3" },
  { src: "/cards/gold_card.png", alt: "Gold card", rot: "-rotate-1" },
  { src: "/cards/platinum_card.png", alt: "Platinum card", rot: "rotate-1" },
  { src: "/cards/black_card.png", alt: "Black card", rot: "rotate-3" },
];

const PROPERTIES = [
  { src: "/art/shack.png", alt: "A rundown shack — the first rung", rot: "-rotate-6" },
  { src: "/art/house.png", alt: "A suburban house", rot: "-rotate-2" },
  { src: "/art/mansion.png", alt: "A luxury mansion", rot: "rotate-2" },
  { src: "/art/private-island.png", alt: "A private island — the top rung", rot: "rotate-6" },
];

export function LandingFeatures() {
  return (
    <section className="border-y border-line bg-panel/40">
      <FeatureSplit
        eyebrow="Start at the bottom"
        title="Study. Work. Get promoted. Repeat."
        body="Eight degrees gate twenty-plus jobs across six sectors. Shifts pay up to 450,000 — and build stress you'll pay to burn off. It's capitalism with a dealer's smile."
        bullets={[
          "8 degrees from 150k to 10M",
          "20+ jobs across six sectors",
          "Shifts pay up to 450,000 (taxed 8%)",
          "Stress is real — !relax costs 25k to 350k",
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
          <div className="flex items-center justify-center px-2 py-6">
            {CARDS.map((c, i) => (
              <div
                key={c.src}
                className={`${c.rot} ${i > 0 ? "-ml-6 sm:-ml-14" : ""} relative aspect-[16/10] w-[84px] shrink-0 overflow-hidden rounded-lg sm:w-[168px]`}
              >
                <Image
                  src={c.src}
                  alt={c.alt}
                  fill
                  sizes="190px"
                  className="scale-[1.3] object-cover"
                />
              </div>
            ))}
          </div>
        }
      />

      <FeatureSplit
        eyebrow="Own things"
        title="From shack to private island."
        body="Buy the shack, flip your way up, and let the rent do the working. Between the zoo, the market, and the bank's deposits, your money earns even when you don't."
        bullets={[
          "Properties pay rent while you're offline",
          "A zoo that earns by rarity — feed it well",
          "One stock market shared by every server, prices tick every 30 min",
          "FD 10% and RD 8% at the bank",
        ]}
        media={
          <div className="flex items-center justify-center overflow-hidden py-6">
            {PROPERTIES.map((p, i) => (
              <div
                key={p.src}
                className={`${p.rot} ${i > 0 ? "-ml-4 sm:-ml-8" : ""} relative aspect-square w-[76px] shrink-0 overflow-hidden rounded-xl border border-line bg-panel sm:w-[140px]`}
              >
                <Image
                  src={p.src}
                  alt={p.alt}
                  fill
                  sizes="140px"
                  className="object-cover"
                />
              </div>
            ))}
          </div>
        }
      />

      <FeatureSplit
        flip
        eyebrow="And when you're feeling lucky"
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
    </section>
  );
}
