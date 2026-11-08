import type { ReactNode } from "react";
import { INVITE_URL, SUPPORT_URL } from "@/lib/links";
import { Container, Reveal, Section, SectionHead } from "./kit";
import { cn } from "@/lib/utils";

/** Three real steps from invite to first job. Numbers from src/content/modules/getting-started.ts. */

function Cmd({ children }: { children: ReactNode }) {
  return <code className="font-mono font-semibold text-gold">{children}</code>;
}

function TextLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold">
      {children}
    </a>
  );
}

const STEPS: { title: ReactNode; body: ReactNode }[] = [
  {
    title: "Add Fortuna",
    body: <><TextLink href={INVITE_URL}>Invite the bot</TextLink> to your server, or <TextLink href={SUPPORT_URL}>play in ours</TextLink>.</>,
  },
  {
    title: <>Run <Cmd>!start</Cmd></>,
    body: <>You get 1,000 Fortunes. Claim <Cmd>!daily</Cmd> for 100,000 and take your first job with <Cmd>!apply waiter</Cmd>.</>,
  },
  {
    title: "Play anywhere",
    body: "Your wallet, job, card, zoo and family follow your Discord account to every server.",
  },
];

export function StartSteps() {
  return (
    // Follows the Crime Families band, whose bottom edge is the rule.
    <Section ruled={false}>
      <Container>
        <SectionHead num="04" title={<>Start in a <em>minute.</em></>} />
        <ol className="m-0 grid list-none grid-cols-1 border-t-[3px] border-ink p-0 min-[860px]:grid-cols-3">
          {STEPS.map((s, i) => (
            <Reveal
              key={i}
              as="li"
              delay={i * 80}
              className={cn(
                "grid content-start gap-3 border-line-2 py-8 min-[860px]:px-6 min-[860px]:first:pl-0 min-[860px]:last:pr-0",
                i < STEPS.length - 1 && "border-b-[1.5px] min-[860px]:border-b-0 min-[860px]:border-r-[1.5px]",
              )}
            >
              <span
                aria-hidden
                className="font-display text-[96px] font-black leading-[.8] text-transparent"
                style={{ WebkitTextStroke: `2px var(--color-${i === 0 ? "gold" : "ink"})` }}
              >
                {i + 1}
              </span>
              <h3 className="font-display text-[40px] font-black uppercase leading-[.9] [&_code]:normal-case">{s.title}</h3>
              <p className="text-lg text-ink-2">{s.body}</p>
            </Reveal>
          ))}
        </ol>
      </Container>
    </Section>
  );
}
