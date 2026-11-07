"use client";

import Image from "next/image";
import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import type { DeedFacts } from "./content";
import { Tile } from "./Tile";

/** Move up: a slider walks the property ladder; the deeds crossfade with a small scale. */
export function PropertyTile({ deeds }: { deeds: DeedFacts[] }) {
  const id = useId();
  const [step, setStep] = useState(0);
  const deed = deeds[step];

  return (
    <Tile kicker="Property · !buy-property" title="Move up." copy="Five deeds, from a Shack to a Private Island. Every one pays rent each 24 hours.">
      <div className="relative h-[170px]">
        {deeds.map((d, i) => (
          <Image
            key={d.name}
            src={d.img}
            alt={i === step ? `A ${d.name.toLowerCase()}` : ""}
            aria-hidden={i !== step}
            fill
            sizes="(min-width: 1024px) 30vw, 90vw"
            className={cn(
              "object-contain transition-[opacity,scale] duration-[140ms] ease-out-expo [image-rendering:pixelated]",
              i === step ? "scale-100 opacity-100" : "scale-[.88] opacity-0",
            )}
          />
        ))}
      </div>
      <label htmlFor={id} className="text-sm text-muted">
        Drag to upgrade · <b className="text-ink">{deed.name}</b>
      </label>
      <input
        id={id}
        type="range"
        min={0}
        max={deeds.length - 1}
        step={1}
        value={step}
        aria-valuetext={deed.name}
        onChange={(e) => setStep(Number(e.target.value))}
        className="h-11 w-full cursor-pointer accent-gold"
      />
      <p className="mt-auto font-mono text-[13px] text-muted">
        Base price {deed.basePrice} · rent {deed.rent} a day
      </p>
    </Tile>
  );
}
