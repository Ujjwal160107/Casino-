/* eslint-disable @next/next/no-img-element -- pixel-art mascot at a fixed size; next/image adds nothing here. */
import { Plus } from "lucide-react";
import { INVITE_URL, SUPPORT_URL } from "@/lib/links";
import { Container, Reveal } from "./kit";
import { btn } from "./styles";
import { cn } from "@/lib/utils";

/** The closing call to action: a gold block with the two ways in and the Don beside them. Nothing here moves on its own: the block lifts in once with Reveal. */

export function FinalCta() {
  return (
    <section className="relative pb-[var(--section-y)] pt-24">
      <Container>
        <Reveal className="grid items-center gap-8 overflow-hidden rounded-[26px] bg-gold p-[clamp(32px,6vw,80px)] text-bg shadow-[14px_14px_0_var(--color-ink)] min-[900px]:grid-cols-[1fr_auto]">
          <div>
            <h2 className="font-display text-[clamp(60px,8.4vw,130px)] font-black uppercase leading-[.8]">
              Your family<br />is waiting.
            </h2>
            <p className="mt-4 text-[19px] font-semibold">Add Fortuna, run !start, and you&apos;re in.</p>
            <div className="mt-8 flex flex-wrap gap-4">
              <a
                href={INVITE_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(btn.base, btn.lg, "border-bg bg-bg text-ink shadow-[4px_4px_0_rgb(12_12_12/.5)] hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[6px_6px_0_rgb(12_12_12/.5)] focus-visible:outline-bg")}
              >
                <Plus aria-hidden className="h-5 w-5" strokeWidth={3} />
                Add to Discord
              </a>
              <a
                href={SUPPORT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(btn.base, btn.lg, "border-bg bg-transparent text-bg hover:bg-bg hover:text-ink focus-visible:outline-bg")}
              >
                Join the community
              </a>
            </div>
          </div>
          <img
            src="/cf/cf_fortuna_don.png"
            alt=""
            width={230}
            height={230}
            className="w-[min(230px,60vw)] justify-self-center [image-rendering:pixelated]"
          />
        </Reveal>
      </Container>
    </section>
  );
}
