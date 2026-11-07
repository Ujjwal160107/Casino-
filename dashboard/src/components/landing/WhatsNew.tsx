import Link from "next/link";
import { Container, Reveal, Section, SectionHead } from "./kit";
import { cn } from "@/lib/utils";

/** The three latest releases, each linking to the changelog. Checked against src/app/changelog/page.tsx. */

const RELEASES = [
  { version: "v2.2", meta: "Nov 5, 2026", title: "Turf leagues", body: "Bronze, Silver and Gold cities of ten rackets, weekly bidding and 60-minute turf wars." },
  { version: "v2.1", meta: "Nov 5, 2026", title: "Crime Families", body: "Families of 10 to 30, crew heists with shared intel, the no-confidence vote and a recruitment board." },
  { version: "v2.0", meta: "Fortuna Global", title: "One account everywhere", body: "Your wallet, job, card and zoo follow you to every server." },
];

export function WhatsNew() {
  return (
    <Section id="whats-new">
      <Container>
        <SectionHead num="05" title={<>What&apos;s <em>new.</em></>} />
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,280px),1fr))] gap-6">
          {RELEASES.map((r, i) => {
            const inverted = i === 0;
            return (
              <Reveal key={r.version} delay={i * 80} className="grid">
                <Link
                  href="/changelog"
                  className={cn(
                    "grid content-start gap-2 rounded-[18px] border-[3px] p-8 transition-[translate,box-shadow] duration-300 ease-[var(--ease-out-expo)] hover:-translate-x-[3px] hover:-translate-y-[3px] motion-reduce:hover:translate-x-0 motion-reduce:hover:translate-y-0",
                    inverted
                      ? "border-ink bg-ink text-bg hover:shadow-[8px_8px_0_var(--color-gold)]"
                      : "border-ink text-ink hover:shadow-[8px_8px_0_var(--color-ink)]",
                  )}
                >
                  {/* Gold on bone fails contrast, so the inverted card keeps its version in ink. */}
                  <span className={cn("font-mono text-[13px] font-bold tracking-[.12em]", inverted ? "text-bg" : "text-gold")}>{r.version}</span>
                  <span className={cn("font-mono text-xs font-semibold", inverted ? "text-bg/70" : "text-muted")}>{r.meta}</span>
                  <b className="mt-2 font-display text-[42px] font-black uppercase leading-[.9]">{r.title}</b>
                  <p className={inverted ? "text-bg/85" : "text-ink-2"}>{r.body}</p>
                </Link>
              </Reveal>
            );
          })}
        </div>
        <Link href="/changelog" className="mt-8 inline-flex min-h-11 items-center gap-2 font-body text-[15px] font-extrabold uppercase tracking-[.05em] text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold">
          Full changelog <span aria-hidden>→</span>
        </Link>
      </Container>
    </Section>
  );
}
