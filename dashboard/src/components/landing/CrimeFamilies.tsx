"use client";

/* eslint-disable @next/next/no-img-element -- small pixel-art turf icons at fixed sizes; next/image adds nothing here. */
import { useEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { BotMessage, type ScreenKey } from "@/components/bot/BotMessage";
import { Container, Reveal, Section, SectionHead, useReducedMotionPref } from "./kit";
import { cn } from "@/lib/utils";

/**
 * Crime Families, the launch feature, told as one crew heist you scroll
 * through: four steps on the left, a sticky Discord card on the right that
 * swaps to the bot's real screen for whichever step is in the middle of the
 * viewport. Then the family facts and the three turf leagues.
 */

type Step = { tag: string; title: string; body: string; screen: ScreenKey; caption: string };

// Copy checked against src/content/modules/crime-families.ts.
const STEPS: Step[] = [
  {
    tag: "01 · Plan",
    title: "The Capo plans the job",
    body: "Four tiers, from the Pawnshop Back Room to the Diamond Exchange Vault. Members who can fill a seat get a DM with a role picker, wherever they play.",
    screen: "lobby3",
    caption: "A crew heist lobby with three seats filled",
  },
  {
    tag: "02 · Crew up",
    title: "Fill every seat",
    body: "Mastermind, Lookout, Safecracker, Driver, Muscle. Each seat has gates, a stake and a part to play.",
    screen: "lobby5",
    caption: "The lobby with all five seats filled",
  },
  {
    tag: "03 · Go",
    title: "Share your intel",
    body: "Your brief answers a question for someone else. Press Share and it lands in their brief, not the channel.",
    screen: "briefShared",
    caption: "A brief with intel shared by a crewmate",
  },
  {
    tag: "04 · Payout",
    title: "Get out clean",
    body: "Every seat locks the right answer and no patrol turns the corner? Clean job. Cuts land in wallets and the vault, and the family earns XP.",
    screen: "result",
    caption: "The result card with every seat's cut",
  },
];

const FACTS = [
  { big: "30", label: "players in a level 10 family" },
  { big: "2/3", label: "of the family to vote out a Boss, within 48 hours" },
  { big: "3", label: "leagues: Bronze L1–3, Silver L4–6, Gold L7–10" },
  { big: "Any", label: "server or DM: crew heists and turf wars follow you" },
];

const LEAGUES = [
  { name: "Bronze", levels: "Level 1–3", icon: "/cf/cf_turf_corner.png", gold: false },
  { name: "Silver", levels: "Level 4–6", icon: "/cf/cf_turf_district.png", gold: false },
  { name: "Gold", levels: "Level 7–10", icon: "/cf/cf_turf_crown.png", gold: true },
];

/** A muted ink for inactive step titles: still 3:1+ on bone at display size. */
const MUTED_INK = "color-mix(in srgb, var(--color-bg) 55%, var(--color-ink))";
const SWAP_MS = 170;

/** Which step sits in the middle band of the viewport. Starts on the first step. */
function useActiveStep(count: number) {
  const refs = useRef<(HTMLLIElement | null)[]>([]);
  const [active, setActive] = useState(0);
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(Number((e.target as HTMLElement).dataset.step)); }),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.slice(0, count).forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [count]);
  return [refs, active] as const;
}

/** The step shown on the stage trails the active step by one short fade, instant under reduced motion. */
function useStagedScreen(active: number, reduced: boolean) {
  const [shown, setShown] = useState(active);
  useEffect(() => {
    if (shown === active) return;
    const t = setTimeout(() => setShown(active), reduced ? 0 : SWAP_MS);
    return () => clearTimeout(t);
  }, [active, shown, reduced]);
  return [shown, shown !== active] as const;
}

/** The dark Discord frame every story screen sits in. */
function StageFrame({ screen }: { screen: ScreenKey }) {
  return (
    <div className="rounded-2xl border-[3px] border-bg bg-[#1b1d23] p-4 shadow-[12px_12px_0_var(--color-gold)]">
      <BotMessage screen={screen} />
    </div>
  );
}

/**
 * One step. From 1000px the inactive ones are muted and the sticky stage
 * shows the screen; below that every step reads at full ink with its own
 * screen inline, because a stage after four steps would only ever show the last.
 */
function StoryStep({ step, index, on, stepRef }: { step: Step; index: number; on: boolean; stepRef: (el: HTMLLIElement | null) => void }) {
  return (
    <li
      ref={stepRef}
      data-step={index}
      aria-current={on ? "step" : undefined}
      className={cn(
        "grid content-center gap-3 border-l-4 border-bg/25 py-6 pl-7 transition-colors duration-300 min-[1000px]:min-h-[38vh]",
        on && "min-[1000px]:border-gold",
      )}
      style={{ "--step-muted": MUTED_INK } as CSSProperties}
    >
      <span className={cn("font-mono text-[13px] font-bold uppercase tracking-[.14em] text-bg transition-opacity duration-300", !on && "min-[1000px]:opacity-70")}>{step.tag}</span>
      <h3 className={cn("font-display text-[clamp(40px,4.4vw,68px)] font-black uppercase leading-[.85] text-bg transition-colors duration-300", !on && "min-[1000px]:text-[color:var(--step-muted)]")}>
        {step.title}
      </h3>
      <p className="max-w-[46ch] text-lg text-bg/80">{step.body}</p>
      <div className="mt-4 mr-3 min-[1000px]:hidden">
        <StageFrame screen={step.screen} />
      </div>
    </li>
  );
}

/** The sticky stage (from 1000px): swaps to the active step's screen with a short fade. */
function StoryStage({ shown, swapping, reduced, stageRef }: { shown: number; swapping: boolean; reduced: boolean; stageRef: RefObject<HTMLDivElement | null> }) {
  const step = STEPS[shown];
  return (
    <div ref={stageRef} className="hidden min-w-0 min-[1000px]:sticky min-[1000px]:top-[110px] min-[1000px]:block">
      <div
        style={{
          opacity: swapping ? 0 : 1,
          transform: swapping ? "translateY(8px)" : "none",
          transition: reduced ? undefined : `opacity ${SWAP_MS}ms ease, transform ${SWAP_MS}ms ease`,
        }}
      >
        <StageFrame screen={step.screen} />
      </div>
      <p className="sr-only" aria-live="polite">{step.caption}</p>
    </div>
  );
}

/**
 * Publishes the stage's height as --stage-h on the story grid, so the steps
 * column can pad its bottom enough that the stuck stage stays fully in view
 * while the last step is active. Writes a CSS variable, so no re-render.
 */
function useStageHeightVar() {
  const gridRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const grid = gridRef.current, stage = stageRef.current;
    if (!grid || !stage || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => grid.style.setProperty("--stage-h", `${stage.offsetHeight}px`));
    ro.observe(stage);
    return () => ro.disconnect();
  }, []);
  return [gridRef, stageRef] as const;
}

function FamilyFacts() {
  return (
    <div className="mt-24 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-6">
      {FACTS.map((f, i) => (
        <Reveal key={f.big} delay={i * 80} className="grid content-start gap-2 border-t-[3px] border-bg pt-4">
          <b className="font-display text-[74px] font-black uppercase leading-[.85]">{f.big}</b>
          <span className="text-bg/80">{f.label}</span>
        </Reveal>
      ))}
    </div>
  );
}

function LeagueBadges() {
  return (
    <ul className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(100%,200px),1fr))] gap-6" aria-label="Turf leagues">
      {LEAGUES.map((l) => (
        <li
          key={l.name}
          className={cn(
            "grid justify-items-center gap-2 rounded-[18px] border-[3px] px-4 py-6 text-center transition-transform duration-300 ease-[var(--ease-out-expo)] hover:-translate-y-1.5 hover:-rotate-[1.5deg] motion-reduce:transition-none motion-reduce:hover:translate-none motion-reduce:hover:rotate-none",
            l.gold ? "border-gold bg-gold text-bg" : "border-bg text-bg",
          )}
        >
          <img src={l.icon} alt="" width={72} height={72} className="h-[72px] w-[72px] [image-rendering:pixelated]" />
          <b className="font-display text-[46px] font-black uppercase leading-none">{l.name}</b>
          <span className="font-mono text-xs font-bold uppercase tracking-[.12em] text-bg/80">{l.levels}</span>
        </li>
      ))}
    </ul>
  );
}

export function CrimeFamilies() {
  const reduced = useReducedMotionPref();
  const [stepRefs, active] = useActiveStep(STEPS.length);
  const [shown, swapping] = useStagedScreen(active, reduced);
  const [gridRef, stageRef] = useStageHeightVar();

  return (
    <Section id="crime-families" ruled={false} className="border-y-[3px] border-ink bg-ink text-bg">
      <Container>
        <SectionHead
          tone="inverted"
          num="03"
          title={
            <>
              Crime{" "}
              {/* Gold text on bone fails contrast: keep the word ink and lay a gold band under it. */}
              <em className="[box-decoration-break:clone] [-webkit-box-decoration-break:clone]" style={{ color: "var(--color-bg)", boxShadow: "inset 0 -0.3em 0 var(--color-gold)" }}>
                families.
              </em>
            </>
          }
          sub="New. Every crewmate holds intel someone else needs. Scroll through one job."
        />

        <div ref={gridRef} className="grid gap-10 min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,560px)] min-[1000px]:items-start">
          {/* When the last step's bottom reaches the 45% line, the grid must still reach 110px + the stage height + room for its 12px shadow. */}
          <ol className="m-0 list-none p-0 min-[1000px]:pb-[max(0px,calc(134px+var(--stage-h,0px)-45vh))]">
            {STEPS.map((s, i) => (
              <StoryStep key={s.tag} step={s} index={i} on={i === active} stepRef={(el) => { stepRefs.current[i] = el; }} />
            ))}
          </ol>
          <StoryStage shown={shown} swapping={swapping} reduced={reduced} stageRef={stageRef} />
        </div>

        <FamilyFacts />
        <LeagueBadges />
      </Container>
    </Section>
  );
}
