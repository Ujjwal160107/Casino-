"use client";

import Image from "next/image";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { CardTierFacts } from "./content";
import { Tile } from "./Tile";

const title = (s: string) => s.charAt(0) + s.slice(1).toLowerCase();

/** Pick a card: tier toggles swap the face; the card flips (hover on fine pointers, click or Enter anywhere) to show its back. */
export function CreditCardTile({ tiers }: { tiers: CardTierFacts[] }) {
  const [active, setActive] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const tier = tiers[active];

  return (
    <Tile kicker="Bank & Credit · !card" title="Pick a card." copy="Your credit score and career tier decide the card. Higher tiers mean bigger limits and lower interest.">
      <div role="group" aria-label="Card tier" className="flex flex-wrap gap-2">
        {tiers.map((t, i) => (
          <button
            key={t.name}
            type="button"
            aria-pressed={i === active}
            onClick={() => setActive(i)}
            className={cn(
              "min-h-11 rounded-full border-2 px-4 font-body text-[13px] font-bold uppercase transition-colors",
              i === active ? "border-ink bg-ink text-bg" : "border-line-2 text-ink hover:border-ink",
            )}
          >
            {title(t.name)}
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setFlipped((f) => !f)}
        aria-pressed={flipped}
        aria-label={`Flip the ${title(tier.name)} card`}
        className="group mx-auto mt-auto block aspect-[761/443] w-full max-w-[320px] rounded-[16px] [perspective:1200px]"
      >
        <span
          className={cn(
            "relative block size-full transition-transform duration-700 ease-out-expo [transform-style:preserve-3d]",
            flipped ? "[transform:rotateY(180deg)]" : "pointer-fine:group-hover:[transform:rotateY(180deg)]",
          )}
        >
          {tiers.map((t, i) => (
            <Image
              key={t.name}
              src={t.face}
              alt={i === active ? `${title(t.name)} credit card` : ""}
              aria-hidden={i !== active}
              fill
              sizes="320px"
              className={cn("object-contain transition-opacity duration-150 [backface-visibility:hidden] [image-rendering:pixelated]", i === active ? "opacity-100" : "opacity-0")}
            />
          ))}
          <span className="absolute inset-0 overflow-hidden rounded-[16px] border-2 border-gold [backface-visibility:hidden] [transform:rotateY(180deg)]">
            <Image src="/card_back.png" alt="" fill sizes="320px" className="object-cover [image-rendering:pixelated]" />
          </span>
        </span>
      </button>
      <p className="text-center font-mono text-[13px] text-muted" aria-live="polite">
        {title(tier.name)} · limit {tier.limit} · {tier.weeklyInterest} weekly interest
      </p>
    </Tile>
  );
}
