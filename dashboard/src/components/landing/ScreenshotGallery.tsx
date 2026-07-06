import { SectionHeader } from "@/components/ui/SectionHeader";
import { ScreenshotSlot } from "@/components/ui/ScreenshotSlot";
import { FadeUp } from "@/components/ui/FadeUp";

const SHOTS = [
  {
    src: "/screenshots/landing-profile.png",
    alt: "A Fortuna player profile in Discord",
    caption: "!profile — the whole empire on one card",
  },
  {
    src: "/screenshots/landing-bank.png",
    alt: "The Fortuna bank dashboard in Discord",
    caption: "!bank — savings, deposits, and your credit card",
  },
  {
    src: "/screenshots/landing-cockfight.png",
    alt: "A Fortuna cockfight match in Discord",
    caption: "!cockfight — side bets open for 60 seconds",
  },
];

export function ScreenshotGallery() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-20">
      <SectionHeader
        eyebrow="The real thing"
        title="Straight from the table"
        sub="Actual Fortuna, running in actual servers. No mockups in this section."
      />
      <div className="grid gap-6 md:grid-cols-3">
        {SHOTS.map((s, i) => (
          <FadeUp key={s.src} delay={i * 0.06}>
            <ScreenshotSlot {...s} />
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
