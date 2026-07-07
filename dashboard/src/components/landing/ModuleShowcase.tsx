import Image from "next/image";
import Link from "next/link";
import { Panel } from "@/components/ui/Panel";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Tag } from "@/components/ui/Tag";
import { FadeUp } from "@/components/ui/FadeUp";

const MODULES = [
  {
    title: "Economy & Money",
    img: "/art/fortunes.png",
    alt: "A pile of golden Fortune coins",
    href: "/docs/economy",
    blurb: "Daily claims, crime, robbery, and the tax man.",
    cmd: "!daily",
  },
  {
    title: "Bank & Credit Cards",
    img: "/cards/gold_card.png",
    alt: "The Fortuna gold credit card",
    href: "/docs/bank-and-credit",
    blurb: "Four card tiers. Weekly statements. Real consequences.",
    cmd: "!bank",
  },
  {
    title: "Casino",
    img: "/art/dice.png",
    alt: "A pair of casino dice",
    href: "/docs/casino",
    blurb: "Six games, published odds, no mercy.",
    cmd: "!blackjack",
  },
  {
    title: "Jobs & Careers",
    img: "/art/business-briefcase.png",
    alt: "A leather business briefcase",
    href: "/docs/jobs-and-careers",
    blurb: "Waiter to Chief of Medicine, one shift at a time.",
    cmd: "!work",
  },
  {
    title: "Education",
    img: "/art/scholarship-letter.png",
    alt: "A sealed scholarship letter",
    href: "/docs/education",
    blurb: "Eight degrees that unlock everything else.",
    cmd: "!enroll",
  },
  {
    title: "Items & Shop",
    img: "/art/mystery-box.png",
    alt: "A mystery box from the shop",
    href: "/docs/items-and-shop",
    blurb: "Tools that bend the rules. Black market included.",
    cmd: "!shop",
  },
  {
    title: "Hunting & Animals",
    img: "/art/white-tiger.png",
    alt: "A rare white tiger",
    href: "/docs/hunting-and-animals",
    blurb: "Rifles, rare beasts, and a zoo that pays rent.",
    cmd: "!hunt",
  },
  {
    title: "Investments",
    img: "/art/stock-market.jpg",
    alt: "A stock market ticker display",
    href: "/docs/investments",
    blurb: "Stocks tick every 30 minutes. Property pays while you sleep.",
    cmd: "!stock",
  },
  {
    title: "Life & Social",
    img: "/art/daily-quest.jpg",
    alt: "A daily quest scroll",
    href: "/docs/life-and-social",
    blurb: "Marriage, quests, stress, and shared bank accounts.",
    cmd: "!marry",
  },
];

export function ModuleShowcase() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-16">
      <SectionHeader
        eyebrow="What's in the box"
        title="Nine systems. One economy."
        sub="Everything below runs on the same wallet — and follows you to every server."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {MODULES.map((m, i) => (
          <FadeUp key={m.title} delay={(i % 3) * 0.06}>
            <Link href={m.href} className="block h-full">
              <Panel className="h-full overflow-hidden transition-colors hover:border-gold/40">
                <div className="relative aspect-square w-full bg-panel">
                  <Image
                    src={m.img}
                    alt={m.alt}
                    fill
                    sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
                    className="object-cover"
                  />
                </div>
                <div className="p-5">
                  <h3 className="font-display text-lg font-bold text-ink">
                    {m.title}
                  </h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted">
                    {m.blurb}
                  </p>
                  <Tag color="gold" className="mt-3 font-mono">
                    {m.cmd}
                  </Tag>
                </div>
              </Panel>
            </Link>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
