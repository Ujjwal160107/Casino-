/* eslint-disable @next/next/no-img-element -- tiny pixel-art emoji and card art at fixed sizes; next/image adds nothing here. */
import { Fragment, type ReactNode } from "react";
import demo from "@/content/demo-screens.json";

/**
 * Renders the bot's real ComponentsV2 payloads (exported by
 * src/scripts/exportDemoScreens.ts) as Discord-style messages. Cards keep
 * Discord's own colours on every theme so they read as the real thing.
 */

type Emoji = { name?: string; id?: string };
type Node = {
  type: number;
  content?: string;
  components?: Node[];
  accessory?: Node;
  items?: { media: { url: string } }[];
  media?: { url: string };
  divider?: boolean;
  spacing?: number;
  style?: number;
  label?: string;
  disabled?: boolean;
  emoji?: Emoji;
  placeholder?: string;
};
type Screen = { components: Node[]; files: Record<string, string> };

const DATA = demo as { now: number; screens: Record<string, Screen> };
export type ScreenKey = keyof typeof demo.screens;

/** Demo cast: the payloads mention these ids. */
const NAMES: Record<string, string> = {
  "100000000000000001": "Vinnie", "100000000000000002": "Rosa", "100000000000000003": "Sal", "100000000000000004": "Nico",
  "100000000000000005": "Mara", "100000000000000006": "Dex", "100000000000000007": "Lou", "100000000000000008": "Kat",
  "100000000000000009": "Benny", "100000000000000010": "Ivy", "100000000000000011": "Tony", "100000000000000012": "Gio",
};
const WEBP = new Set(["cf_caper_t1", "cf_caper_t2", "cf_caper_t3", "cf_caper_t4", "cf_result_bust", "cf_result_clean", "cf_result_messy", "cf_turf_map", "cf_war_banner"]);

function art(name: string): string {
  const base = name.replace(/\.(png|webp)$/, "");
  return `/cf/${base}.${WEBP.has(base) ? "webp" : "png"}`;
}
function emojiSrc(e: Emoji): string | null {
  if (e.name?.startsWith("cf_")) return art(e.name);
  return e.id ? `/cf/e${e.id}.png` : null;
}

function relTime(ts: number): string {
  const d = ts - DATA.now / 1000;
  const a = Math.abs(d);
  const [n, u] = a < 3600 ? [Math.max(1, Math.round(a / 60)), "minute"] : a < 86400 ? [Math.round(a / 3600), "hour"] : [Math.round(a / 86400), "day"];
  const w = `${n} ${u}${n === 1 ? "" : "s"}`;
  return d >= 0 ? `in ${w}` : `${w} ago`;
}

// Inline markdown: code, escapes, custom emoji, mentions, timestamps, links, bold, italics.
const TOKEN = /(`[^`]+`)|\\([*_~|#<>[\]()`\\-])|<a?:(\w+):(\w+)>|<@!?(\d+)>|<t:(\d+)(?::\w)?>|\[([^\]]+)\]\(([^)]+)\)|\*\*(.+?)\*\*|(?<!\*)\*([^*]+)\*/g;
function inline(text: string, key = "i"): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  // A fresh regex per call: inline() recurses into bold/italics, and a shared
  // global regex would have its lastIndex reset by the inner call, re-matching
  // the same token forever.
  const re = new RegExp(TOKEN.source, "g");
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const k = `${key}-${i++}`;
    if (m[1]) out.push(<code key={k} className="rounded border border-[#30333b] bg-[#1a1c21] px-1 font-mono text-[12px]">{m[1].slice(1, -1)}</code>);
    else if (m[2]) out.push(m[2]);
    else if (m[3]) {
      const src = emojiSrc({ name: m[3], id: m[4] });
      if (src) out.push(<img key={k} src={src} alt="" className="inline h-[19px] w-[19px] object-contain align-[-4px] [image-rendering:pixelated]" />);
    } else if (m[5]) out.push(<span key={k} className="rounded bg-[#5865f2]/30 px-[3px] font-medium text-[#c9cdfb]">@{NAMES[m[5]] ?? "member"}</span>);
    else if (m[6]) out.push(<span key={k} className="rounded bg-[#2e3138] px-1">{relTime(Number(m[6]))}</span>);
    else if (m[7]) out.push(<span key={k} className="text-[#00a8fc]">{m[7]}</span>);
    else if (m[9]) out.push(<b key={k} className="font-bold text-[#f2f3f5]">{inline(m[9], k)}</b>);
    else if (m[10]) out.push(<i key={k}>{inline(m[10], k)}</i>);
    last = re.lastIndex;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function Markdown({ content }: { content: string }) {
  const lines = content.split("\n");
  const out: ReactNode[] = [];
  let quote: string[] = [];
  const flush = (k: number) => {
    if (!quote.length) return;
    out.push(<div key={`q${k}`} className="border-l-[3px] border-[#4e5058] pl-[9px] text-[#c4c7cd]">{quote.map((q, j) => <Fragment key={j}>{j > 0 && <br />}{inline(q, `q${k}${j}`)}</Fragment>)}</div>);
    quote = [];
  };
  lines.forEach((line, k) => {
    if (line.startsWith("> ")) { quote.push(line.slice(2)); return; }
    flush(k);
    if (line.startsWith("## ")) out.push(<div key={k} className="text-[17px] font-bold leading-tight text-[#f2f3f5]">{inline(line.slice(3), `l${k}`)}</div>);
    else if (line.startsWith("### ")) out.push(<div key={k} className="text-[15.5px] font-bold leading-tight text-[#f2f3f5]">{inline(line.slice(4), `l${k}`)}</div>);
    else if (line.startsWith("-# ")) out.push(<div key={k} className="text-[12px] text-[#949ba4]">{inline(line.slice(3), `l${k}`)}</div>);
    else if (line.trim() === "") out.push(<div key={k} className="h-[5px]" />);
    else out.push(<div key={k}>{inline(line, `l${k}`)}</div>);
  });
  flush(lines.length);
  return <>{out}</>;
}

const BUTTON: Record<number, string> = { 1: "bg-[#5865f2]", 2: "bg-[#3c3f47]", 3: "bg-[#248046]", 4: "bg-[#da373c]", 5: "bg-[#3c3f47]" };

type Live = { label: string; onPress: () => void } | null;

function LiveRing({ on }: { on: boolean }) {
  return on ? <span aria-hidden className="pointer-events-none absolute -inset-[3px] animate-pulse rounded-[9px] ring-2 ring-gold" /> : null;
}

function Button({ b, live }: { b: Node; live: Live }) {
  const em = b.emoji ? emojiSrc(b.emoji) : null;
  const isLive = live?.label === b.label;
  const cls = `relative inline-flex min-h-8 items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 text-[13.5px] font-semibold text-white ${BUTTON[b.style ?? 2] ?? BUTTON[2]} ${b.disabled ? "opacity-50" : ""}`;
  const inner = <>{em && <img src={em} alt="" className="h-[18px] w-[18px] [image-rendering:pixelated]" />}{b.label && <span>{b.label}</span>}<LiveRing on={isLive} /></>;
  if (isLive) return <button type="button" onClick={live!.onPress} className={`${cls} transition hover:brightness-110 active:scale-95`} aria-label={`${b.label} (try it)`}>{inner}</button>;
  return <span className={cls}>{inner}</span>;
}

function Select({ s, live }: { s: Node; live: Live }) {
  const isLive = live?.label === s.placeholder;
  const cls = "relative flex min-h-[38px] w-full items-center justify-between rounded-[7px] border border-[#383b43] bg-[#1a1c21] px-3 text-[14px] text-[#a0a4ad]";
  const inner = <><span>{s.placeholder || "Select…"}</span><svg width="14" height="14" viewBox="0 0 24 24" aria-hidden><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.5" fill="none" /></svg><LiveRing on={isLive} /></>;
  return isLive ? <button type="button" onClick={live!.onPress} className={`${cls} text-left`} aria-label={`${s.placeholder} (try it)`}>{inner}</button> : <div className={cls}>{inner}</div>;
}

function Part({ c, live }: { c: Node; live: Live }): ReactNode {
  switch (c.type) {
    case 17: return <div className="mt-[3px] flex flex-col gap-[7px] rounded-[9px] border border-[#30333b] bg-[#23252c] px-3.5 py-3">{c.components?.map((x, i) => <Part key={i} c={x} live={live} />)}</div>;
    case 10: return <div><Markdown content={c.content ?? ""} /></div>;
    case 9: {
      const acc = c.accessory!;
      return (
        <div className="flex items-start gap-3">
          <div className="flex min-w-0 flex-1 flex-col gap-[7px]">{c.components?.map((x, i) => <Part key={i} c={x} live={live} />)}</div>
          {acc.type === 11 ? <img src={art(acc.media!.url.replace("attachment://", ""))} alt="" className="h-[72px] w-[72px] rounded-lg bg-[#1b1d22] object-contain [image-rendering:pixelated]" /> : <Button b={acc} live={live} />}
        </div>
      );
    }
    case 12: return <div>{c.items?.map((it, i) => {
      const src = art(it.media.url.replace("attachment://", ""));
      // The heist banners still carry an old "Fortuna's Capers" plaque in the art: crop it off.
      return /cf_caper_t\d/.test(src)
        ? <div key={i} className="overflow-hidden rounded-lg" style={{ aspectRatio: "960 / 246" }}><img src={src} alt="" className="w-full [image-rendering:pixelated]" style={{ marginTop: "-9.4%" }} /></div>
        : <img key={i} src={src} alt="" className="w-full rounded-lg [image-rendering:pixelated]" />;
    })}</div>;
    case 14: return <div className={`my-[3px] h-px ${c.divider === false ? "" : "bg-[#3a3d45]"}`} />;
    case 1: return <div className="flex flex-wrap gap-[7px]">{c.components?.map((x, i) => (x.type === 3 ? <Select key={i} s={x} live={live} /> : <Button key={i} b={x} live={live} />))}</div>;
    default: return null;
  }
}

export function BotMessage({ screen, live = null, dm = false, time = "Today at 6:00 PM" }: { screen: ScreenKey; live?: Live; dm?: boolean; time?: string }) {
  const p = DATA.screens[screen];
  return (
    <div className="flex gap-3 text-left font-body text-[14.5px] leading-[1.42] text-[#dfe1e5]">
      <img src="/cf/cf_fortuna_don.png" alt="" className="h-10 w-10 flex-none rounded-full bg-[#2a2d35] object-cover [image-rendering:pixelated]" />
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] flex flex-wrap items-center gap-[7px]">
          {dm && <span className="rounded bg-[#5865f2] px-1.5 py-px font-mono text-[10px] font-bold text-white">DM</span>}
          <span className="font-semibold text-gold">Fortuna</span>
          <span className="rounded bg-[#5865f2] px-[5px] pb-[2px] pt-px text-[9.5px] font-bold text-white">APP</span>
          <span className="text-[11.5px] text-[#8a8f99]">{time}</span>
        </div>
        {p.components.map((c, i) => <Part key={i} c={c} live={live} />)}
      </div>
    </div>
  );
}

export function UserMessage({ name, color, text }: { name: string; color: string; text: string }) {
  return (
    <div className="flex gap-3 text-left text-[14.5px] leading-[1.42] text-[#dfe1e5]">
      <div className="grid h-10 w-10 flex-none place-items-center rounded-full text-[17px] font-extrabold text-[#111]" style={{ background: color }}>{name[0]}</div>
      <div className="min-w-0 flex-1">
        <div className="mb-[3px] flex items-center gap-[7px]"><span className="font-semibold text-[#f2f3f5]">{name}</span><span className="text-[11.5px] text-[#8a8f99]">Today at 6:00 PM</span></div>
        <div className="font-mono text-[13.5px] text-[#e8eaee]">{text}</div>
      </div>
    </div>
  );
}
