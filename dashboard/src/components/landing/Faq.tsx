import Link from "next/link";
import type { ReactNode } from "react";
import { Container, Section, SectionHead } from "./kit";

/** Four short answers in a native <details> accordion, so it works with the keyboard and without JS. */

function Cmd({ children }: { children: ReactNode }) {
  return <code className="font-mono font-semibold text-gold">{children}</code>;
}

const QUESTIONS: { q: string; a: ReactNode }[] = [
  { q: "Is Fortuna free to play?", a: <>Yes. Add it to your server and run <Cmd>!start</Cmd>.</> },
  { q: "Does my progress carry between servers?", a: "Yes. Everything is tied to your Discord account: wallet, bank, job, degrees, credit card, zoo and family." },
  {
    q: "Can I join a family from another server?",
    a: <>Yes. Families are global. Find one on <Cmd>!crew board</Cmd>, apply, and play crew heists and turf wars from any server or from the bot&apos;s DMs.</>,
  },
  {
    q: "Where can I see the odds and payouts?",
    a: <>In the <Link href="/docs" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold">docs</Link>. Every payout, odd, cooldown and limit is published there.</>,
  },
];

export function Faq() {
  return (
    <Section>
      <Container className="grid gap-x-8 min-[1000px]:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] min-[1000px]:items-start">
        <SectionHead num="06" title={<><em>FAQ.</em></>} />
        <div className="border-t-[3px] border-ink">
          {QUESTIONS.map(({ q, a }) => (
            <details key={q} className="group border-b-[1.5px] border-line-2">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-[18px] text-[19px] font-extrabold [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden className="text-2xl font-black leading-none text-gold transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="pb-[18px] text-lg text-ink-2">{a}</p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}
