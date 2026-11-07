"use client";

import { useEffect, useEffectEvent, useRef, useState, type FocusEvent } from "react";
import { Pause, Play } from "lucide-react";
import { BotMessage, UserMessage, type ScreenKey } from "@/components/bot/BotMessage";
import { cn } from "@/lib/utils";
import { useReducedMotionPref } from "./kit";

/**
 * A playable Discord channel that runs real Crime Families flows with the
 * bot's exported cards. It auto-plays (pressing the glowing button itself)
 * until the visitor touches, focuses or pauses it; under reduced motion it
 * never auto-plays or types, and shows the first flow's opening state at once.
 */

type Step = {
  key: ScreenKey;
  /** Label of the button/select to make live; the flow waits for it. */
  press?: string;
  /** Replace the previous bot message instead of posting a new one. */
  edit?: boolean;
  /** Pause after showing this step (no button to wait on). */
  after?: boolean;
  dm?: boolean;
  hint?: string;
};
type Flow = { cmd: string; chip: string; who: [name: string, color: string]; steps: Step[] };

const FLOWS = {
  heist: { cmd: "!heist plan 2", chip: "!heist plan 2", who: ["Vinnie", "#ffb627"], steps: [
    { key: "lobby1", press: "Join as…", hint: "Pick a role to join the crew" },
    { key: "lobby5", edit: true, press: "Start", hint: "Everyone's in. Start the job" },
    { key: "brief", press: "Share", hint: "Your intel is for Sal. Share it" },
    { key: "briefShared", edit: true, after: true, hint: "Intel relayed" },
    { key: "result", hint: "Clean job. Try another command" },
  ] },
  board: { cmd: "!crew board", chip: "!crew board", who: ["Gio", "#4c8dff"], steps: [
    { key: "board", press: "Open a family", hint: "Open a family's card" },
    { key: "familyCard", edit: true, press: "Apply…", hint: "Your stats pass every check. Apply" },
    { key: "familyCardSent", edit: true, after: true },
    { key: "dmAccepted", dm: true, hint: "You're in. Try another command" },
  ] },
  turf: { cmd: "!turf", chip: "!turf", who: ["Vinnie", "#ffb627"], steps: [
    { key: "turfMap", press: "War board", hint: "A war is live. Open the board" },
    { key: "warBoard", edit: true, press: "Hit Docks", hint: "Hit the Docks" },
    { key: "hitCall", press: "Pier 4", hint: "Pick the approach your scout called" },
    { key: "hitResult", after: true },
    { key: "warResult", hint: "Racket captured. Try another command" },
  ] },
  vote: { cmd: "!crew vote", chip: "!crew vote", who: ["Kat", "#2f9e6e"], steps: [
    { key: "vote", press: "Vote YES", hint: "Cast a secret ballot" },
    { key: "voteResult", edit: true, after: true },
    { key: "dmNewBoss", dm: true, hint: "New Boss. Try another command" },
  ] },
  vault: { cmd: "!crew vault", chip: "!crew vault", who: ["Rosa", "#e5484d"], steps: [
    { key: "vault", press: "Payday", hint: "Pay every member" },
    { key: "payday", hint: "Paid. Try another command" },
  ] },
  create: { cmd: "/crew create Velvet Ante VLA", chip: "/crew create", who: ["Vinnie", "#ffb627"], steps: [
    { key: "create", press: "Confirm", hint: "Found the family" },
    { key: "dashboard", edit: true, hint: "Your family is live. Try another command" },
  ] },
} satisfies Record<string, Flow>;

type FlowName = keyof typeof FLOWS;
const ORDER = Object.keys(FLOWS) as FlowName[];
const FIRST_HINT = "Tap a command, then press the glowing button.";

type Entry =
  | { id: number; kind: "user"; name: string; color: string; text: string }
  | { id: number; kind: "bot"; screen: ScreenKey; dm: boolean; live: string | null }
  | { id: number; kind: "typing" };
type NewEntry = Entry extends infer E ? (E extends Entry ? Omit<E, "id"> : never) : never;

type Engine = {
  run: number;
  auto: boolean;
  reduced: boolean;
  timers: Set<number>;
  /** Presses the armed live button (null when none is armed). */
  press: (() => void) | null;
  nextId: number;
  flow: FlowName;
  /** The current flow has played to its end. */
  done: boolean;
};

/** Cancels whatever flow is running: bumps the run id, clears its timers and disarms its button. */
function halt(eng: Engine) {
  eng.run++;
  eng.timers.forEach((t) => clearTimeout(t));
  eng.timers.clear();
  eng.press = null;
}

const nextFlow = (name: FlowName) => ORDER[(ORDER.indexOf(name) + 1) % ORDER.length];
const LIVE_BUTTON = '[aria-label$="(try it)"]';

/** Which sides of the chip strip have chips scrolled out of view. */
type Edges = { l: boolean; r: boolean };
function chipEdges(el: HTMLElement, prev: Edges): Edges {
  const l = el.scrollLeft > 2;
  const r = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
  return l === prev.l && r === prev.r ? prev : { l, r };
}
function edgeMask({ l, r }: Edges) {
  if (!l && !r) return undefined;
  return `linear-gradient(to right, ${l ? "transparent, #000 40px" : "#000"}, ${r ? "#000 calc(100% - 40px), transparent" : "#000"})`;
}

const CHAT_CSS = `
.demo-in { animation: demo-in .35s var(--ease-out-expo) both; }
@keyframes demo-in { from { opacity: 0; transform: translateY(10px); } }
.demo-dot { animation: demo-dot 1s infinite; }
.demo-dot:nth-child(2) { animation-delay: .15s; } .demo-dot:nth-child(3) { animation-delay: .3s; }
@keyframes demo-dot { 0%, 80%, 100% { transform: none; opacity: .4; } 40% { transform: translateY(-4px); opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .demo-in, .demo-dot { animation: none; } }
`;

export function DemoChat({ headerClassName }: { headerClassName?: string }) {
  const [active, setActive] = useState<FlowName | null>(null);
  const [playing, setPlaying] = useState(true);
  const [edges, setEdges] = useState<Edges>({ l: false, r: false });
  const reducedPref = useReducedMotionPref();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [typed, setTyped] = useState("");
  const [hint, setHint] = useState(FIRST_HINT);
  const logRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const chipsRef = useRef<HTMLDivElement>(null);
  const toggleRef = useRef<HTMLButtonElement>(null);
  // Engine state: the current run (bumped to cancel a flow), auto-play, pending timers, the armed button.
  const engine = useRef<Engine>({ run: 0, auto: true, reduced: false, timers: new Set(), press: null, nextId: 0, flow: ORDER[0], done: false });

  function setAuto(on: boolean) {
    engine.current.auto = on;
    setPlaying(on);
  }
  /** Auto-presses `fire` after a beat, unless auto-play was paused meanwhile. */
  function autoPress(fire: () => void) {
    after(1900, () => { if (engine.current.auto) fire(); });
  }

  function after(ms: number, fn: () => void) {
    const t = window.setTimeout(() => { engine.current.timers.delete(t); fn(); }, engine.current.reduced ? 0 : ms);
    engine.current.timers.add(t);
  }
  const sleep = (ms: number) => new Promise<void>((res) => after(ms, res));
  function push(e: NewEntry) {
    const id = engine.current.nextId++;
    setEntries((list) => [...list, { ...e, id } as Entry]);
    return id;
  }
  function patch(id: number, e: Partial<NewEntry>) {
    setEntries((list) => list.map((x) => (x.id === id ? ({ ...x, ...e } as Entry) : x)));
  }

  async function play(name: FlowName) {
    halt(engine.current);
    const id = engine.current.run;
    const live = () => id === engine.current.run;
    const f: Flow = FLOWS[name];
    engine.current.flow = name;
    engine.current.done = false;
    setActive(name);
    setEntries([]);
    setTyped("");

    if (!engine.current.reduced) {
      for (let i = 1; i <= f.cmd.length; i++) {
        setTyped(f.cmd.slice(0, i));
        await sleep(26);
        if (!live()) return;
      }
      await sleep(200);
      if (!live()) return;
      setTyped("");
    }
    push({ kind: "user", name: f.who[0], color: f.who[1], text: f.cmd });

    let cur: number | null = null;
    for (const s of f.steps) {
      if (!s.edit && !engine.current.reduced) {
        const t = push({ kind: "typing" });
        await sleep(480);
        if (!live()) return;
        setEntries((list) => list.filter((x) => x.id !== t));
      }
      const msg = { kind: "bot" as const, screen: s.key, dm: !!s.dm, live: s.press ?? null };
      if (s.edit && cur !== null) patch(cur, msg);
      else cur = push(msg);
      if (s.hint) setHint(s.hint);

      if (s.press) {
        const armed = cur;
        await new Promise<void>((res) => {
          let done = false;
          const fire = () => {
            if (done || !live()) return;
            done = true;
            engine.current.press = null;
            patch(armed, { live: null });
            res();
          };
          engine.current.press = fire;
          if (engine.current.auto) autoPress(fire);
        });
        await sleep(150);
        if (!live()) return;
      } else if (s.after) {
        await sleep(900);
        if (!live()) return;
      }
    }

    engine.current.done = true;
    if (engine.current.auto) {
      await sleep(3000);
      if (live() && engine.current.auto) play(nextFlow(name));
    }
  }

  /** Turns auto-play back on from wherever the demo stopped. */
  function resume() {
    setAuto(true);
    const eng = engine.current;
    if (eng.done) void play(nextFlow(eng.flow));
    else if (eng.press) autoPress(eng.press);
  }

  const start = useEffectEvent(() => {
    setPlaying(engine.current.auto);
    void play(ORDER[0]);
  });
  useEffect(() => {
    const eng = engine.current;
    eng.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    eng.auto = !eng.reduced;
    const t = window.setTimeout(start, eng.reduced ? 0 : 400);
    return () => {
      clearTimeout(t);
      halt(eng);
    };
  }, []);

  // Keep the newest message in view, including when card art finishes loading.
  useEffect(() => {
    const log = logRef.current, content = contentRef.current;
    if (!log || !content || typeof ResizeObserver === "undefined") return;
    const pin = () => { log.scrollTop = log.scrollHeight; };
    const ro = new ResizeObserver(pin);
    ro.observe(content);
    return () => ro.disconnect();
  }, []);

  // A keyboard (or pointer) user who pressed a live button stays in the log; follow them to the next one.
  useEffect(() => {
    const log = logRef.current;
    if (!log || document.activeElement !== log) return;
    log.querySelector<HTMLElement>(LIVE_BUTTON)?.focus({ preventScroll: true });
  }, [entries]);

  // Fade the chip strip's edge on whichever side has chips out of view.
  useEffect(() => {
    const el = chipsRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setEdges((prev) => chipEdges(el, prev)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const choose = (name: FlowName) => { setAuto(false); void play(name); };
  const pressLive = () => {
    setAuto(false);
    const fire = engine.current.press;
    if (!fire) return;
    // The pressed card is about to re-render without this button: park focus on the log first.
    logRef.current?.focus({ preventScroll: true });
    fire();
  };
  // Any focus inside the demo (other than the pause toggle itself) hands control to the visitor.
  const onFocusIn = (e: FocusEvent<HTMLDivElement>) => { if ((e.target as Node) !== toggleRef.current) setAuto(false); };
  const mask = edgeMask(edges);

  return (
    <div role="region" aria-label="Try Fortuna: a demo chat" onFocus={onFocusIn} className="flex h-[600px] max-h-[76vh] min-w-0 flex-col overflow-hidden rounded-[13px] bg-[#1b1d23] font-body">
      <style href="fortuna-demo-chat" precedence="default">{CHAT_CSS}</style>

      <div className={cn("flex items-center gap-2.5 border-b border-[#2a2d35] px-4 py-1 text-sm font-semibold text-[#f2f3f5]", headerClassName)}>
        <span aria-hidden className="font-mono text-lg font-bold text-[#8a8f99]">#</span>
        family-hq
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[11px] font-bold tracking-[.12em] text-gold">
          <span aria-hidden className="h-[7px] w-[7px] rounded-full bg-gold" />
          LIVE DEMO
        </span>
        {!reducedPref && (
          <button
            ref={toggleRef}
            type="button"
            aria-pressed={!playing}
            aria-label="Pause demo"
            title={playing ? "Pause demo" : "Play demo"}
            onClick={() => (playing ? setAuto(false) : resume())}
            className="grid h-11 w-11 flex-none place-items-center rounded-full border-[1.5px] border-[#3c3f47] text-[#f2f3f5] transition-colors hover:border-gold hover:text-gold"
          >
            {playing ? <Pause size={16} aria-hidden /> : <Play size={16} aria-hidden />}
          </button>
        )}
      </div>

      <div ref={logRef} tabIndex={-1} onPointerDown={() => setAuto(false)} className="flex-1 overflow-y-auto overscroll-contain p-4 focus-visible:outline-offset-[-3px]">
        <div ref={contentRef} className="flex flex-col gap-4">
          {entries.map((e) => (
            <div key={e.id} className="demo-in">
              {e.kind === "user" && <UserMessage name={e.name} color={e.color} text={e.text} />}
              {e.kind === "bot" && (
                <BotMessage screen={e.screen} dm={e.dm} time={e.dm ? "now" : undefined} live={e.live ? { label: e.live, onPress: pressLive } : null} />
              )}
              {e.kind === "typing" && (
                <div className="flex items-center gap-2 text-[13px] text-[#9ba0aa]">
                  <span aria-hidden className="flex gap-1">
                    <i className="demo-dot h-1.5 w-1.5 rounded-full bg-[#9ba0aa]" />
                    <i className="demo-dot h-1.5 w-1.5 rounded-full bg-[#9ba0aa]" />
                    <i className="demo-dot h-1.5 w-1.5 rounded-full bg-[#9ba0aa]" />
                  </span>
                  Fortuna is typing…
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-2.5 border-t border-[#2a2d35] bg-[#1b1d23] p-3">
        <div
          ref={chipsRef}
          role="group"
          aria-label="Commands to try"
          onScroll={(e) => { const el = e.currentTarget; setEdges((prev) => chipEdges(el, prev)); }}
          style={{ maskImage: mask, WebkitMaskImage: mask }}
          className="flex gap-2 overflow-x-auto [scrollbar-width:none] sm:flex-wrap [&::-webkit-scrollbar]:hidden"
        >
          {ORDER.map((name) => {
            const on = active === name;
            return (
              <button
                key={name}
                type="button"
                aria-pressed={on}
                onClick={() => choose(name)}
                className={`min-h-11 flex-none rounded-full border-[1.5px] px-3.5 font-mono text-[13px] font-semibold transition-[transform,background-color,color,border-color] duration-150 active:scale-95 ${on ? "border-gold bg-gold text-[#111]" : "border-[#3c3f47] bg-[#23252c] text-[#f2f3f5] hover:border-gold"}`}
              >
                {FLOWS[name].chip}
              </button>
            );
          })}
        </div>
        <div aria-hidden className="flex min-h-[46px] items-center gap-1 rounded-[10px] border border-[#383b43] bg-[#23252c] px-3.5 font-mono text-sm text-[#f2f3f5]">
          <span className="whitespace-pre">{typed}</span>
          <span className="h-[18px] w-0.5 bg-gold" />
        </div>
        <p aria-live="polite" className="text-center text-xs text-[#9ba0aa]">{hint}</p>
      </div>
    </div>
  );
}
