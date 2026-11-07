"use client";

import { useEffect, useEffectEvent, useReducer, useRef, useState, type KeyboardEvent, type TransitionEvent } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { Container, Section, btn, useReducedMotionPref } from "./kit";

/**
 * The Crime Families launch trailer on a CSS laptop. When the laptop scrolls
 * well into view the lid swings open, the trailer plays muted on the screen,
 * and the lid closes when it ends ("Watch again" replays). Scrolling away
 * pauses and closes; coming back re-opens and carries on, unless the visitor
 * paused it themselves. Under reduced motion (and before hydration) the
 * laptop sits open on the poster with a Play button and nothing autoplays.
 */

const SRC = "/video/crime-families-trailer.mp4";
const POSTER = "/video/crime-families-trailer-poster.jpg";

// Lid transition lengths (ms); the fallback timer finishes a lid move if transitionend never fires.
const OPEN_MS = 1300;
const CLOSE_MS = 1150;
const LID_SLACK_MS = 250;

/*
 * Geometry, all in units of the lid width --w. The rig's origin is the hinge.
 * The lid (w x .6w) stands on it and turns about its bottom edge: 6deg back
 * when open, -90deg (flat, forward onto the deck) when closed. The deck is a
 * w x .6w plane laid flat towards the viewer, a hair below the hinge so the
 * closed lid never z-fights it, with a front edge face and a gold offset
 * shadow plane under it. The whole rig leans 13deg towards the viewer, so the
 * laptop reads as seen from slightly above. The projected silhouette spans
 * about 1.18w by .80w, which sizes the stage (no overflow, no layout shift).
 */
const LAPTOP_CSS = `
.lv-wrap { container-type: inline-size; overflow-x: clip; }
.lv-stage {
  /* Width-bound, and height-bound so the whole laptop (stage = 0.84w) fits under the nav with room to spare. */
  --w: min(800px, calc(100cqw / 1.22), calc((100svh - 190px) / 0.84));
  position: relative; width: 100%;
  height: calc(var(--w) * .84);
  perspective: calc(var(--w) * 4.5);
  perspective-origin: 50% calc(var(--w) * .625);
}
.lv-rig {
  position: absolute; left: 50%; top: calc(var(--w) * .625);
  width: var(--w); height: 0;
  transform: translateX(-50%) rotateX(-13deg);
  transform-origin: 50% 0;
  transform-style: preserve-3d;
}
.lv-lid {
  position: absolute; left: 0; bottom: 0; width: 100%; height: calc(var(--w) * .6);
  transform-origin: 50% 100%; transform-style: preserve-3d;
  transform: rotateX(6deg);
}
.lv-stage[data-lid="closed"] .lv-lid { transform: rotateX(-90deg); }
.lv-face, .lv-back {
  position: absolute; inset: 0;
  -webkit-backface-visibility: hidden; backface-visibility: hidden;
  border: 3px solid var(--color-ink);
}
.lv-face {
  background: var(--color-bg);
  border-radius: calc(var(--w) * .022) calc(var(--w) * .022) calc(var(--w) * .008) calc(var(--w) * .008);
}
/* Fully shut: drop the screen (and its video layer) entirely, in case a browser ignores backface-visibility on video. */
.lv-stage[data-shut] .lv-face { visibility: hidden; }
.lv-back {
  display: grid; place-items: center;
  background: var(--color-panel-2);
  border-radius: calc(var(--w) * .008) calc(var(--w) * .008) calc(var(--w) * .022) calc(var(--w) * .022);
  transform: rotateX(180deg) translateZ(1px);
}
.lv-back span { font-size: calc(var(--w) * .045); }
.lv-cam {
  position: absolute; top: calc(var(--w) * .011); left: 50%;
  width: max(4px, calc(var(--w) * .007)); aspect-ratio: 1; border-radius: 50%;
  background: var(--color-line-2); transform: translateX(-50%);
}
.lv-screen {
  position: absolute; left: calc(var(--w) * .022); right: calc(var(--w) * .022); top: calc(var(--w) * .026);
  aspect-ratio: 16 / 9; overflow: hidden;
  border-radius: calc(var(--w) * .006);
  background: var(--color-bg);
}
.lv-shade { position: absolute; inset: 0; background: var(--color-bg); opacity: 0; pointer-events: none; }
.lv-stage[data-lid="closed"] .lv-shade { opacity: .9; }
.lv-deck {
  position: absolute; left: 0; top: calc(var(--w) * .004); width: 100%; height: calc(var(--w) * .6);
  transform-origin: 50% 0; transform: rotateX(90deg); transform-style: preserve-3d;
  background: var(--color-panel-2); border: 3px solid var(--color-ink);
  border-radius: calc(var(--w) * .006) calc(var(--w) * .006) calc(var(--w) * .008) calc(var(--w) * .008);
}
.lv-front {
  position: absolute; left: -3px; right: -3px; top: calc(100% + 3px); height: calc(var(--w) * .024);
  transform-origin: 50% 0; transform: rotateX(-90deg);
  background: var(--color-panel); border: 3px solid var(--color-ink);
  border-radius: 0 0 calc(var(--w) * .008) calc(var(--w) * .008);
}
.lv-notch {
  position: absolute; left: 50%; top: 0; width: 16%; height: 55%;
  transform: translateX(-50%); background: var(--color-bg);
  border-radius: 0 0 calc(var(--w) * .006) calc(var(--w) * .006);
}
.lv-shadow {
  position: absolute; left: calc(var(--w) * .022); top: calc(var(--w) * .028); width: 100%; height: calc(var(--w) * .6);
  transform-origin: 50% 0; transform: rotateX(90deg) translateY(calc(var(--w) * .022));
  background: var(--color-gold);
  border-radius: calc(var(--w) * .006) calc(var(--w) * .006) calc(var(--w) * .008) calc(var(--w) * .008);
}
/* Transitions exist only while the lid is moving, so state jumps (hydration, arming) snap. */
.lv-stage[data-anim][data-lid="open"] .lv-lid { transition: transform ${OPEN_MS}ms var(--ease-out-expo); will-change: transform; }
.lv-stage[data-anim][data-lid="closed"] .lv-lid { transition: transform ${CLOSE_MS}ms cubic-bezier(.65, 0, .35, 1); will-change: transform; }
.lv-stage[data-anim][data-lid="open"] .lv-shade { transition: opacity ${OPEN_MS - 400}ms ease-out 150ms; }
.lv-stage[data-anim][data-lid="closed"] .lv-shade { transition: opacity ${CLOSE_MS}ms cubic-bezier(.65, 0, .35, 1); }
.lv-pop { animation: lv-pop .5s var(--ease-out-expo) .1s both; }
@keyframes lv-pop { from { opacity: 0; transform: translateY(10px); } }
@media (prefers-reduced-motion: reduce) {
  .lv-lid, .lv-shade { transition: none !important; }
  .lv-pop { animation: none; }
}
`;

// Keyboard: five rows of fourteen keys, then a bottom row with a space bar (deck units, 100 x 60).
const KEY_PITCH = 82 / 14;
const KEYS = [
  ...Array.from({ length: 5 }, (_, r) => Array.from({ length: 14 }, (_, c) => ({ x: 9 + c * KEY_PITCH, y: 5 + r * 4.6, w: KEY_PITCH - 0.8 }))).flat(),
  ...[0, 1, 2, 10, 11, 12, 13].map((c) => ({ x: 9 + c * KEY_PITCH, y: 28, w: KEY_PITCH - 0.8 })),
  { x: 9 + 3 * KEY_PITCH, y: 28, w: 7 * KEY_PITCH - 0.8 },
];

/*
 * Sequence. rest: open on the poster (server render, reduced motion). armed:
 * closed, waiting to be in view. opening -> open (video plays) -> closingEnd
 * -> done (Watch again). Leaving the view while opening/open goes to
 * closingAway -> armed; coming back mid-close re-opens.
 */
type Phase = "rest" | "armed" | "opening" | "open" | "closingAway" | "closingEnd" | "done";
type State = { phase: Phase; inView: boolean; userPaused: boolean };
type Action =
  | { t: "view"; inView: boolean | null; motion: boolean }
  | { t: "open" }
  | { t: "lidDone" }
  | { t: "ended"; motion: boolean }
  | { t: "play" }
  | { t: "pause" }
  | { t: "replay"; motion: boolean };

function reduce(s: State, a: Action): State {
  switch (a.t) {
    case "view": {
      const inView = a.inView ?? s.inView;
      let phase = s.phase;
      if (a.motion && phase === "rest") phase = "armed";
      else if (inView === false && (phase === "opening" || phase === "open")) phase = "closingAway";
      else if (inView && phase === "closingAway") phase = "opening";
      return { ...s, inView, phase };
    }
    case "open":
      return s.phase === "armed" && s.inView ? { ...s, phase: "opening" } : s;
    case "lidDone": {
      const next: Partial<Record<Phase, Phase>> = { opening: "open", closingAway: "armed", closingEnd: "done" };
      return { ...s, phase: next[s.phase] ?? s.phase };
    }
    case "ended":
      return { ...s, phase: a.motion ? "closingEnd" : "done" };
    case "play":
      // From a closed or resting laptop only under reduced motion (the controls are inert otherwise).
      return { ...s, userPaused: false, phase: s.phase === "rest" || s.phase === "armed" || s.phase === "done" ? "open" : s.phase };
    case "pause":
      return { ...s, userPaused: true };
    case "replay":
      return { ...s, userPaused: false, phase: a.motion ? "armed" : "open" };
  }
}

const INITIAL: State = { phase: "rest", inView: false, userPaused: false };

export function LaunchVideo() {
  const reduced = useReducedMotionPref();
  const [{ phase, inView, userPaused }, dispatch] = useReducer(reduce, INITIAL);
  const [preload, setPreload] = useState<"metadata" | "auto">("metadata");
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [blocked, setBlocked] = useState(false);

  const stageRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const replayRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"toggle" | "replay" | null>(null);

  const moving = phase === "opening" || phase === "closingAway" || phase === "closingEnd";
  const lidOpen = reduced || phase === "rest" || phase === "opening" || phase === "open";
  const faceLive = reduced || phase === "rest" || phase === "open";
  const shut = !reduced && (phase === "armed" || phase === "done");
  const finished = phase === "closingEnd" || phase === "done";
  const status = finished ? "Finished" : playing ? "Playing" : started ? "Paused" : "Ready";

  function playVideo() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted; // set the property, not just the attribute, so mobile autoplay is allowed
    v.play().catch((err: unknown) => {
      if (!v.muted && err instanceof DOMException && err.name === "NotAllowedError") {
        // Sound needs a fresh gesture here: carry on muted.
        v.muted = true;
        setMuted(true);
        v.play().catch(() => setBlocked(true));
      } else {
        setBlocked(true);
      }
    });
  }

  function finishLid() {
    if (phase === "opening" && !userPaused) playVideo();
    dispatch({ t: "lidDone" });
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      dispatch({ t: "play" });
      playVideo();
    } else {
      dispatch({ t: "pause" });
      v.pause();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  }

  function replay() {
    const v = videoRef.current;
    if (v) v.currentTime = 0;
    focusNext.current = "toggle";
    dispatch({ t: "replay", motion: !reduced });
    if (reduced) playVideo();
  }

  function onEnded() {
    if (faceRef.current?.contains(document.activeElement)) focusNext.current = "replay";
    dispatch({ t: "ended", motion: !reduced });
  }

  function onLidTransitionEnd(e: TransitionEvent<HTMLDivElement>) {
    if (e.target === e.currentTarget && e.propertyName === "transform" && moving) finishLid();
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey || !faceLive) return;
    const key = e.key.toLowerCase();
    if (key === "k") togglePlay();
    else if (key === "m") toggleMute();
    else return;
    e.preventDefault();
  }

  // In view = at least 45% of the laptop showing; out of view = under 10%. In between keeps the last answer.
  const onView = useEffectEvent((ratio: number, intersecting: boolean) => {
    const seen = intersecting && ratio >= 0.45 ? true : !intersecting || ratio < 0.1 ? false : null;
    if (seen === false) videoRef.current?.pause();
    dispatch({ t: "view", inView: seen, motion: !reduced });
  });
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => onView(e.intersectionRatio, e.isIntersecting), { threshold: [0, 0.1, 0.45] });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Start buffering properly once the laptop is near.
  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setPreload("auto");
        io.disconnect();
      }
    }, { rootMargin: "800px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Armed and in view: open on the second frame, so the closed pose is painted before the transition.
  useEffect(() => {
    if (reduced || phase !== "armed" || !inView) return;
    let raf = requestAnimationFrame(() => {
      raf = requestAnimationFrame(() => dispatch({ t: "open" }));
    });
    return () => cancelAnimationFrame(raf);
  }, [reduced, phase, inView]);

  // Finish a lid move even if transitionend never arrives (hidden tab, interrupted style).
  const finishLidLater = useEffectEvent(() => finishLid());
  useEffect(() => {
    if (reduced || !(phase === "opening" || phase === "closingAway" || phase === "closingEnd")) return;
    const t = window.setTimeout(finishLidLater, (phase === "opening" ? OPEN_MS : CLOSE_MS) + LID_SLACK_MS);
    return () => clearTimeout(t);
  }, [reduced, phase]);

  // Keep keyboard focus on a live control when the one it was on disappears.
  useEffect(() => {
    if (phase === "done" && focusNext.current === "replay") {
      focusNext.current = null;
      replayRef.current?.focus();
    } else if (phase === "open" && focusNext.current === "toggle") {
      focusNext.current = null;
      toggleRef.current?.focus();
    }
  }, [phase]);

  const showBigPlay = !started && faceLive && (reduced || phase === "rest" || blocked);
  const showControls = started && faceLive && phase !== "done";

  return (
    <Section id="trailer">
      <style href="fortuna-launch-video" precedence="default">{LAPTOP_CSS}</style>
      <Container>
        <div className="mb-16 border-b-[3px] border-ink pb-5">
          <p className="inline-flex items-center gap-3 font-mono text-[13px] font-bold uppercase tracking-[.16em] text-ink">
            <span aria-hidden className="h-[3px] w-9 bg-ink" />
            The launch trailer
          </p>
          <h2 className="mt-4 font-display text-[clamp(46px,6.4vw,104px)] font-black uppercase leading-[.85] [&_em]:not-italic [&_em]:text-gold">
            Watch it <em>drop.</em>
          </h2>
          <p className="mt-4 max-w-[56ch] text-lg text-ink-2">Crime Families in sixty seconds. It starts with the sound off; turn it on from the screen.</p>
        </div>

        <div className="lv-wrap">
          <div
            ref={stageRef}
            role="group"
            aria-label="Trailer player"
            className="lv-stage"
            data-phase={phase}
            data-lid={lidOpen ? "open" : "closed"}
            data-anim={!reduced && moving ? "" : undefined}
            data-shut={shut ? "" : undefined}
            onKeyDown={onKeyDown}
          >
            <div className="lv-rig">
              <div aria-hidden className="lv-shadow" />
              <div aria-hidden className="lv-deck">
                <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 60" preserveAspectRatio="none">
                  {KEYS.map((k, i) => (
                    <rect key={i} x={k.x} y={k.y} width={k.w} height={3.8} rx={0.5} className="fill-bg stroke-line-2" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                  ))}
                  <rect x={34} y={36} width={32} height={18} rx={1.2} className="fill-panel stroke-line-2" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="lv-front">
                  <div className="lv-notch" />
                </div>
              </div>
              <div className="lv-lid" onTransitionEnd={onLidTransitionEnd}>
                <div aria-hidden className="lv-back">
                  <span className="font-display font-black uppercase tracking-[.08em] text-gold">Fortuna</span>
                </div>
                <div ref={faceRef} className="lv-face" inert={!faceLive}>
                  <span aria-hidden className="lv-cam" />
                  <div className="lv-screen">
                    <video
                      ref={videoRef}
                      className="absolute inset-0 h-full w-full object-cover"
                      src={SRC}
                      poster={POSTER}
                      preload={preload}
                      muted={muted}
                      playsInline
                      aria-label="Fortuna Crime Families launch trailer"
                      onClick={faceLive ? togglePlay : undefined}
                      onPlay={() => {
                        setPlaying(true);
                        setStarted(true);
                        setBlocked(false);
                      }}
                      onPause={() => setPlaying(false)}
                      onEnded={onEnded}
                    />
                    <div aria-hidden className="lv-shade" />

                    {showBigPlay && (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <button type="button" onClick={togglePlay} className={cn(btn.base, btn.main, "pointer-events-auto sm:min-h-14 sm:px-8 sm:text-[17px]")}>
                          <Play size={20} strokeWidth={3} fill="currentColor" aria-hidden />
                          Play trailer
                        </button>
                      </div>
                    )}
                    {reduced && phase === "done" && (
                      <div className="pointer-events-none absolute inset-0 grid place-items-center">
                        <button ref={replayRef} type="button" onClick={replay} className={cn(btn.base, btn.main, "pointer-events-auto sm:min-h-14 sm:px-8 sm:text-[17px]")}>
                          <RotateCcw size={20} strokeWidth={3} aria-hidden />
                          Watch again
                        </button>
                      </div>
                    )}

                    {showControls && (
                      <div className="absolute inset-x-2 bottom-2 flex items-center justify-between gap-2 sm:inset-x-4 sm:bottom-4">
                        <button
                          ref={toggleRef}
                          type="button"
                          onClick={togglePlay}
                          aria-label={playing ? "Pause trailer" : "Play trailer"}
                          className="inline-flex size-11 items-center justify-center rounded-full border-2 border-ink bg-bg/85 text-ink transition-colors hover:bg-ink hover:text-bg"
                        >
                          {playing ? <Pause size={18} strokeWidth={3} fill="currentColor" aria-hidden /> : <Play size={18} strokeWidth={3} fill="currentColor" aria-hidden />}
                        </button>
                        <button
                          type="button"
                          onClick={toggleMute}
                          className={cn(
                            "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 font-mono text-[13px] font-bold uppercase tracking-[.08em] transition-colors",
                            muted ? "border-gold bg-gold text-bg hover:bg-ink hover:border-ink" : "border-ink bg-bg/85 text-ink hover:bg-ink hover:text-bg",
                          )}
                        >
                          {muted ? <VolumeX size={18} strokeWidth={2.5} aria-hidden /> : <Volume2 size={18} strokeWidth={2.5} aria-hidden />}
                          {muted ? "Unmute" : "Mute"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Centred in the empty space above the closed laptop (the hinge sits at ~74% of the stage). */}
            {!reduced && phase === "done" && (
              <div className="lv-pop pointer-events-none absolute inset-x-0 top-0 z-10 grid h-[70%] place-items-center">
                <button ref={replayRef} type="button" onClick={replay} className={cn(btn.base, btn.main, btn.lg, "pointer-events-auto")}>
                  <RotateCcw size={20} strokeWidth={3} aria-hidden />
                  Watch again
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[13px] font-bold uppercase tracking-[.12em] text-muted">
          <p className="inline-flex items-center gap-2">
            <span aria-hidden className={cn("size-2 rounded-full", playing ? "bg-gold" : "bg-line-2")} />
            <span role="status" aria-live="polite">{status}</span>
          </p>
          <p className="hidden sm:block">K play/pause · M mute</p>
        </div>
      </Container>
    </Section>
  );
}
