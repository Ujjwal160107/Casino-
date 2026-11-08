"use client";

import { useEffect, useEffectEvent, useRef, useState, type KeyboardEvent } from "react";
import { Pause, Play, RotateCcw, Volume2, VolumeX } from "lucide-react";
import { cn } from "@/lib/utils";
import { btn, useReducedMotionPref } from "./kit";

/**
 * The Crime Families launch trailer on a flat laptop, as a pinned scroll
 * sequence. The section is several viewports tall with a sticky stage: the
 * laptop rises into place, holds while the trailer plays (in real time, not
 * scrubbed), then zooms until its screen fills the viewport, and the page
 * moves on. Scroll progress is smoothed and written straight to the DOM.
 * Under reduced motion it is a normal-height section with a still laptop,
 * the poster and a Play button.
 */

const SRC = "/video/crime-families-trailer.mp4";
const POSTER = "/video/crime-families-trailer-poster.jpg";

// Progress segments: rise, hold (trailer plays), zoom.
const RISE_END = 0.2;
const ZOOM_START = 0.72;
// Autoplay at or past RISE_END; pause again only below this (hysteresis).
const PAUSE_BELOW = 0.12;
// Fraction of the remaining distance covered per 60 Hz frame.
const LERP = 0.12;
// The sticky nav's height (72px row + 3px rule); the laptop centres below it.
const NAV = 75;

const CHIPS = ["Crews of 10 to 30", "Crew heists", "Weekly turf wars"];

const STAGE_CSS = `
.lt-wrap { position: relative; height: 420vh; }
@media (max-width: 767px) { .lt-wrap { height: 300vh; } }
.lt-stage {
  /* The base is 12% wider than the lid: (100vw - 24px) / 1.12 keeps lid and base inside 12px gutters. */
  --lw: min(1000px, calc((100vw - 24px) / 1.12), calc((100svh - ${NAV}px - 150px) * 1.587));
  --graphite: color-mix(in srgb, var(--color-ink) 7%, var(--color-bg));
  --graphite-2: color-mix(in srgb, var(--color-ink) 13%, var(--color-bg));
  --hair: color-mix(in srgb, var(--color-ink) 55%, transparent);
  position: sticky; top: 0; height: 100svh; overflow: hidden;
}
.lt-head { position: absolute; inset-inline: 0; top: calc(${NAV}px + clamp(24px, 5svh, 56px)); padding-inline: 16px; text-align: center; }
/* One track pinned to the stage width, so nothing wider can stretch it and push the laptop off centre. */
.lt-center { position: absolute; inset: ${NAV}px 0 0 0; display: grid; grid-template: minmax(0, 1fr) / minmax(0, 1fr); place-items: center; }
.lt-glow {
  position: absolute; left: calc(50% - var(--lw) * .675); top: calc(50% - var(--lw) * .421875);
  width: calc(var(--lw) * 1.35); height: calc(var(--lw) * .84375); border-radius: 50%; pointer-events: none;
  background: radial-gradient(closest-side, color-mix(in srgb, var(--color-gold) 34%, transparent), transparent);
  opacity: 0;
}
.lt-laptop { position: relative; width: var(--lw); }
.lt-lid { position: relative; height: calc(var(--lw) * .6); }
.lt-frame {
  position: absolute; inset: 0; background: var(--graphite); border: 1.5px solid var(--hair);
  border-radius: calc(var(--lw) * .03) calc(var(--lw) * .03) calc(var(--lw) * .012) calc(var(--lw) * .012);
}
.lt-screen {
  position: absolute; left: calc(var(--lw) * .022); right: calc(var(--lw) * .022); top: calc(var(--lw) * .03);
  aspect-ratio: 16 / 9; overflow: hidden; background: var(--color-bg);
  border-radius: calc(var(--lw) * .008);
}
.lt-stage[data-full] .lt-screen { border-radius: 0; }
.lt-notch {
  position: absolute; top: calc(var(--lw) * .03 - 1px); left: calc(50% - var(--lw) * .065); width: calc(var(--lw) * .13); height: calc(var(--lw) * .02);
  background: var(--graphite); border-radius: 0 0 calc(var(--lw) * .008) calc(var(--lw) * .008);
}
.lt-base {
  position: relative; left: -6%; width: 112%; height: calc(var(--lw) * .03);
  background: var(--graphite-2); border: 1.5px solid var(--hair); border-top-color: var(--color-gold);
  border-radius: 2px 2px calc(var(--lw) * .03) calc(var(--lw) * .03) / 2px 2px calc(var(--lw) * .02) calc(var(--lw) * .02);
  box-shadow: 0 calc(var(--lw) * .02) calc(var(--lw) * .04) calc(var(--lw) * -.02) var(--color-bg);
}
.lt-lip {
  position: absolute; top: 0; left: calc(50% - var(--lw) * .08); width: calc(var(--lw) * .16); height: 45%;
  background: var(--graphite); border-radius: 0 0 calc(var(--lw) * .01) calc(var(--lw) * .01);
}
.lt-chips { position: absolute; inset-inline: 0; top: calc(${NAV}px + (100svh - ${NAV}px + var(--lw) * .63) / 2 + 20px); padding-inline: 16px; opacity: 0; }
.lt-chip { transition: color .3s ease, border-color .3s ease; }
.lt-chips[data-step="0"] .lt-chip:nth-child(1), .lt-chips[data-step="1"] .lt-chip:nth-child(2), .lt-chips[data-step="2"] .lt-chip:nth-child(3) {
  color: var(--color-gold); border-color: var(--color-gold);
}
.lt-ctrl { position: absolute; right: 0; bottom: 0; z-index: 2; opacity: 0; visibility: hidden; transition: opacity .3s ease, visibility 0s linear .3s; }
.lt-stage[data-live] .lt-ctrl { opacity: 1; visibility: visible; transition: opacity .3s ease; }
@media (prefers-reduced-motion: reduce) {
  .lt-wrap { height: auto; }
  .lt-stage { position: relative; height: auto; overflow: visible; padding-block: var(--section-y); }
  .lt-head { position: static; margin-bottom: 64px; }
  .lt-center { position: static; }
  .lt-glow, .lt-chips, .lt-ctrl { display: none; }
}
`;

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);

/** Layout offset of el inside ancestor, ignoring transforms. */
function offsetWithin(el: HTMLElement, ancestor: HTMLElement) {
  let x = 0;
  let y = 0;
  let node: HTMLElement | null = el;
  while (node && node !== ancestor) {
    x += node.offsetLeft;
    y += node.offsetTop;
    node = node.offsetParent as HTMLElement | null;
  }
  return { x, y };
}

type Els = {
  wrap: HTMLElement;
  stage: HTMLDivElement;
  head: HTMLDivElement;
  glow: HTMLDivElement;
  laptop: HTMLDivElement;
  frame: HTMLDivElement;
  notch: HTMLDivElement;
  base: HTMLDivElement;
  screen: HTMLDivElement;
  chips: HTMLDivElement;
  ctrl: HTMLDivElement;
};

/** Stage size and the screen's resting box, plus the per-breakpoint scales. */
type Geo = { vw: number; vh: number; cx: number; cy: number; sw: number; sh: number; sFill: number; s0: number; ty0: number; inset: number };

function measure(els: Els): Geo {
  const vw = els.stage.clientWidth;
  const vh = els.stage.clientHeight;
  const phone = vw < 768;
  const sw = els.screen.offsetWidth;
  const sh = els.screen.offsetHeight;
  const s = offsetWithin(els.screen, els.stage);
  const l = offsetWithin(els.laptop, els.stage);
  const cx = s.x + sw / 2;
  const cy = s.y + sh / 2;
  // Every scale happens around the screen's centre.
  els.laptop.style.transformOrigin = `${cx - l.x}px ${cy - l.y}px`;
  return {
    vw,
    vh,
    cx,
    cy,
    sw,
    sh,
    // Desktop: cover the viewport. Phones: fill the width only (covering a tall screen would crop most of the video).
    sFill: (phone ? vw / sw : Math.max(vw / sw, vh / sh)) * 1.02,
    s0: phone ? 0.9 : 0.78,
    ty0: vh * (phone ? 0.4 : 0.55),
    inset: phone ? 8 : 16,
  };
}

/** Writes the whole scene for smoothed progress p (0..1). */
function paint(p: number, g: Geo, els: Els) {
  const r = easeOutCubic(clamp01(p / RISE_END));
  const z = easeInOutCubic(clamp01((p - ZOOM_START) / (1 - ZOOM_START)));
  const s = lerp(g.s0, 1, r) * lerp(1, g.sFill, z);
  const ty = lerp(g.ty0, 0, r);
  const dx = (g.vw / 2 - g.cx) * z;
  const dy = (g.vh / 2 - g.cy) * z;
  els.laptop.style.transform = `translate3d(${dx}px, ${ty + dy}px, 0) scale(${s})`;

  const chrome = String(1 - clamp01(z * 1.5));
  els.frame.style.opacity = chrome;
  els.notch.style.opacity = chrome;
  els.base.style.opacity = chrome;
  els.base.style.transform = `translate3d(0, ${z * 48}px, 0)`;

  els.glow.style.opacity = String(r * (1 - z));
  els.glow.style.transform = `translate3d(0, ${ty}px, 0) scale(${0.6 + 0.4 * r})`;

  els.head.style.opacity = String(1 - clamp01(r * 1.25));
  els.head.style.transform = `translate3d(0, ${-56 * r}px, 0)`;

  els.chips.style.opacity = String(clamp01((p - (RISE_END - 0.04)) / 0.06) * (1 - clamp01((p - ZOOM_START) / 0.08)));
  const step = String(Math.min(CHIPS.length - 1, Math.max(0, Math.floor((p - RISE_END) / ((ZOOM_START - RISE_END) / CHIPS.length)))));
  if (els.chips.dataset.step !== step) els.chips.dataset.step = step;

  // Controls ride the screen's bottom-right corner, then stick to the viewport's corner once the screen overflows it.
  const cornerX = g.cx + dx + (g.sw / 2) * s;
  const cornerY = g.cy + ty + dy + (g.sh / 2) * s;
  els.ctrl.style.transform = `translate3d(${Math.min(cornerX, g.vw) - g.vw - g.inset}px, ${Math.min(cornerY, g.vh) - g.vh - g.inset}px, 0)`;

  toggleData(els.stage, "live", p >= RISE_END - 0.01);
  toggleData(els.stage, "full", z > 0.95);
}

function toggleData(el: HTMLElement, key: string, on: boolean) {
  if (on && el.dataset[key] === undefined) el.dataset[key] = "";
  else if (!on && el.dataset[key] !== undefined) delete el.dataset[key];
}

const MOVING = ["laptop", "base", "glow", "head", "chips", "ctrl"] as const;
const STYLED = ["laptop", "frame", "notch", "base", "glow", "head", "chips", "ctrl"] as const;

export function LaunchVideo() {
  const reduced = useReducedMotionPref();
  const [preload, setPreload] = useState<"metadata" | "auto">("metadata");
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [ended, setEnded] = useState(false);

  const wrapRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLDivElement>(null);
  const laptopRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const notchRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const ctrlRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  // Set when the visitor pauses; scrolling never resumes playback until they press Play.
  const userPaused = useRef(false);

  const status = ended ? "Finished" : playing ? "Playing" : started ? "Paused" : "Ready";

  function playVideo() {
    const v = videoRef.current;
    if (!v) return;
    v.muted = muted; // the property, not just the attribute, so mobile allows muted autoplay
    v.play().catch((err: unknown) => {
      if (!v.muted && err instanceof DOMException && err.name === "NotAllowedError") {
        // Sound needs a fresh gesture here: carry on muted.
        v.muted = true;
        setMuted(true);
        v.play().catch(() => {});
      }
    });
  }

  function togglePlay() {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) {
      userPaused.current = false;
      playVideo();
    } else {
      userPaused.current = true;
      v.pause();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    if (videoRef.current) videoRef.current.muted = next;
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    const key = e.key.toLowerCase();
    if (key === "k") togglePlay();
    else if (key === "m") toggleMute();
    else return;
    e.preventDefault();
  }

  // Scroll zones: play from the hold onwards, pause above the rise or once the stage has mostly left.
  const onZone = useEffectEvent((zone: "play" | "pause") => {
    const v = videoRef.current;
    if (!v) return;
    if (zone === "pause") v.pause();
    else if (!userPaused.current && !v.ended) playVideo();
  });

  // The scroll sequence: raw progress from the wrapper, eased towards with a frame-rate-independent lerp.
  useEffect(() => {
    if (reduced) return;
    const parts = {
      wrap: wrapRef.current,
      stage: stageRef.current,
      head: headRef.current,
      glow: glowRef.current,
      laptop: laptopRef.current,
      frame: frameRef.current,
      notch: notchRef.current,
      base: baseRef.current,
      screen: screenRef.current,
      chips: chipsRef.current,
      ctrl: ctrlRef.current,
    };
    if (Object.values(parts).some((el) => !el)) return;
    const els = parts as Els;

    let geo = measure(els);
    let zone: "play" | "pause" | null = null;
    const read = () => {
      const rect = els.wrap.getBoundingClientRect();
      const total = rect.height - geo.vh;
      const p = total > 0 ? clamp01(-rect.top / total) : 0;
      const gone = rect.bottom < geo.vh * 0.4;
      const next = p >= RISE_END && !gone ? "play" : p < PAUSE_BELOW || gone ? "pause" : null;
      if (next && next !== zone) {
        zone = next;
        onZone(next);
      }
      return p;
    };

    let target = read();
    let cur = target;
    let raf = 0;
    let last = 0;
    const setMoving = (on: boolean) => {
      for (const k of MOVING) els[k].style.willChange = on ? "transform, opacity" : "";
    };
    const frame = (t: number) => {
      const dt = last ? Math.min(64, t - last) : 1000 / 60;
      last = t;
      cur += (target - cur) * (1 - (1 - LERP) ** (dt / (1000 / 60)));
      if (Math.abs(target - cur) < 0.0004) cur = target;
      paint(cur, geo, els);
      if (cur !== target) {
        raf = requestAnimationFrame(frame);
      } else {
        raf = 0;
        last = 0;
        setMoving(false);
      }
    };
    const onScroll = () => {
      target = read();
      if (!raf && target !== cur) {
        setMoving(true);
        raf = requestAnimationFrame(frame);
      }
    };
    const ro = new ResizeObserver(() => {
      geo = measure(els);
      target = read();
      cur = target;
      paint(cur, geo, els);
    });

    paint(cur, geo, els);
    ro.observe(els.stage);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener("scroll", onScroll);
      for (const k of STYLED) {
        els[k].style.transform = "";
        els[k].style.opacity = "";
        els[k].style.willChange = "";
      }
      els.laptop.style.transformOrigin = "";
      toggleData(els.stage, "live", false);
      toggleData(els.stage, "full", false);
    };
  }, [reduced]);

  // Start buffering properly once the section is near.
  useEffect(() => {
    const el = wrapRef.current;
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

  const controls = (
    <Controls playing={playing} muted={muted} ended={ended} onToggle={togglePlay} onMute={toggleMute} />
  );

  return (
    <section ref={wrapRef} id="trailer" className="lt-wrap border-t border-line" aria-labelledby="trailer-title">
      <style href="fortuna-launch-video" precedence="default">{STAGE_CSS}</style>
      <div ref={stageRef} className="lt-stage" onKeyDown={onKeyDown}>
        <div ref={headRef} className="lt-head">
          <p className="inline-flex items-center gap-3 font-mono text-[13px] font-bold uppercase tracking-[.16em] text-ink">
            <span aria-hidden className="h-[3px] w-9 bg-ink" />
            The launch trailer
          </p>
          <h2 id="trailer-title" className="mt-4 font-display text-[clamp(56px,9vw,150px)] font-black uppercase leading-[.85] [&_em]:not-italic [&_em]:text-gold">
            Watch it <em>drop.</em>
          </h2>
        </div>

        <div className="lt-center">
          <div ref={glowRef} aria-hidden className="lt-glow" />
          <div ref={laptopRef} className="lt-laptop">
            <div className="lt-lid">
              <div ref={frameRef} aria-hidden className="lt-frame" />
              <div ref={screenRef} className="lt-screen">
                <video
                  ref={videoRef}
                  className="absolute inset-0 h-full w-full object-cover"
                  src={SRC}
                  poster={POSTER}
                  preload={preload}
                  muted={muted}
                  playsInline
                  aria-label="Fortuna Crime Families launch trailer"
                  onClick={togglePlay}
                  onPlay={() => {
                    setPlaying(true);
                    setStarted(true);
                    setEnded(false);
                  }}
                  onPause={() => setPlaying(false)}
                  onEnded={() => setEnded(true)}
                />
                {reduced && !started && (
                  <div className="pointer-events-none absolute inset-0 grid place-items-center">
                    <button type="button" onClick={togglePlay} className={cn(btn.base, btn.main, "pointer-events-auto sm:min-h-14 sm:px-8 sm:text-[17px]")}>
                      <Play size={20} strokeWidth={3} fill="currentColor" aria-hidden />
                      Play trailer
                    </button>
                  </div>
                )}
                {reduced && started && <div className="absolute bottom-2 right-2 sm:bottom-4 sm:right-4">{controls}</div>}
              </div>
              <div ref={notchRef} aria-hidden className="lt-notch" />
            </div>
            <div ref={baseRef} aria-hidden className="lt-base">
              <div className="lt-lip" />
            </div>
          </div>
        </div>

        <div ref={chipsRef} aria-hidden className="lt-chips flex flex-wrap justify-center gap-2" data-step="0">
          {CHIPS.map((c) => (
            <span key={c} className="lt-chip inline-flex min-h-9 items-center rounded-full border-2 border-line-2 px-4 font-mono text-[12px] font-bold uppercase tracking-[.1em] text-muted">
              {c}
            </span>
          ))}
        </div>

        <div ref={ctrlRef} className="lt-ctrl">
          {!reduced && controls}
        </div>

        <p role="status" aria-live="polite" className="sr-only">
          {status}
        </p>
      </div>
    </section>
  );
}

/** Play/Pause and Mute: 44px, labelled, the same pair over the screen and in the corner. */
function Controls({ playing, muted, ended, onToggle, onMute }: { playing: boolean; muted: boolean; ended: boolean; onToggle: () => void; onMute: () => void }) {
  const ToggleIcon = playing ? Pause : ended ? RotateCcw : Play;
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        aria-label={playing ? "Pause trailer" : ended ? "Replay trailer" : "Play trailer"}
        className={cn(
          "inline-flex size-11 items-center justify-center rounded-full border-2 transition-colors",
          playing ? "border-ink bg-bg/85 text-ink hover:bg-ink hover:text-bg" : "border-gold bg-gold text-bg hover:border-ink hover:bg-ink",
        )}
      >
        <ToggleIcon size={18} strokeWidth={3} fill={ended && !playing ? "none" : "currentColor"} aria-hidden />
      </button>
      <button
        type="button"
        onClick={onMute}
        className={cn(
          "inline-flex min-h-11 items-center gap-2 rounded-full border-2 px-4 font-mono text-[13px] font-bold uppercase tracking-[.08em] transition-colors",
          muted ? "border-gold bg-gold text-bg hover:border-ink hover:bg-ink" : "border-ink bg-bg/85 text-ink hover:bg-ink hover:text-bg",
        )}
      >
        {muted ? <VolumeX size={18} strokeWidth={2.5} aria-hidden /> : <Volume2 size={18} strokeWidth={2.5} aria-hidden />}
        {muted ? "Unmute" : "Mute"}
      </button>
    </div>
  );
}
