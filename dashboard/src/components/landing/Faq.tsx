import Link from "next/link";
import { FAQ, type FaqSegment } from "@/content/faq";
import { Container, Section, SectionHead } from "./kit";

/** Four short answers in a native <details> accordion, so it works with the keyboard and without JS. */

function Answer({ segments }: { segments: FaqSegment[] }) {
  return segments.map((s, i) =>
    typeof s === "string" ? (
      s
    ) : "cmd" in s ? (
      <code key={i} className="font-mono font-semibold text-gold">{s.cmd}</code>
    ) : (
      <Link key={i} href={s.href} className="font-semibold text-ink underline decoration-gold decoration-2 underline-offset-4 hover:text-gold">
        {s.label}
      </Link>
    ),
  );
}

export function Faq() {
  return (
    <Section>
      <Container className="grid gap-x-8 min-[1000px]:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)] min-[1000px]:items-start">
        <SectionHead num="06" title={<><em>FAQ.</em></>} />
        <div className="border-t-[3px] border-ink">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="group border-b-[1.5px] border-line-2">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-[18px] text-[19px] font-extrabold [&::-webkit-details-marker]:hidden">
                {q}
                <span aria-hidden className="text-2xl font-black leading-none text-gold transition-transform duration-200 group-open:rotate-45 motion-reduce:transition-none">+</span>
              </summary>
              <p className="pb-[18px] text-lg text-ink-2"><Answer segments={a} /></p>
            </details>
          ))}
        </div>
      </Container>
    </Section>
  );
}
