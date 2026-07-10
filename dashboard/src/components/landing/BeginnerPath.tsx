import Link from "next/link";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Panel } from "@/components/ui/Panel";
import { FadeUp } from "@/components/ui/FadeUp";

const STEPS = [
  {
    cmd: "!start",
    text: "Open your account. 1,000 Fortunes to your name.",
    href: "/docs/getting-started",
  },
  {
    cmd: "!daily",
    text: "Claim 100,000 free Fortunes. Every day. No catch.",
    href: "/docs/economy",
  },
  {
    cmd: "!work",
    text: "Get a job, clock a shift, cash a paycheck.",
    href: "/docs/jobs-and-careers",
  },
  {
    cmd: "!blackjack 10000",
    text: "Sit at the table. Learn what 2.5x feels like.",
    href: "/docs/casino",
  },
];

export function BeginnerPath() {
  return (
    <section className="mx-auto max-w-[90rem] px-6 py-16">
      <SectionHeader
        eyebrow="New player?"
        title="Your first 10 minutes"
        sub="Four commands between you and your first bad decision."
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => (
          <FadeUp key={s.cmd} delay={i * 0.06}>
            <Link href={s.href} className="block h-full">
              <Panel className="h-full p-6 transition-colors hover:border-gold/40">
                <p className="font-mono text-sm text-gold">step {i + 1}</p>
                <p className="mt-2 font-mono text-lg font-bold text-ink">
                  {s.cmd}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {s.text}
                </p>
              </Panel>
            </Link>
          </FadeUp>
        ))}
      </div>
    </section>
  );
}
