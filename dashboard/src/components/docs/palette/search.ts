import type { SearchItem } from "./search-index";

/** Shown before the player types anything. */
const POPULAR = ["!crew", "!heist", "!turf", "!daily", "!work"];
const PER_GROUP = 20;

export interface ResultGroup {
  title: "Popular" | "Commands" | "Docs";
  items: SearchItem[];
}

export function queryWords(query: string) {
  return query.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * Every word must appear (AND). Items whose label holds the first word rank
 * above items that only match in their description.
 */
export function searchItems(items: SearchItem[], query: string): ResultGroup[] {
  const words = queryWords(query);
  if (!words.length) {
    const popular = POPULAR.map((name) => items.find((it) => it.kind === "command" && it.label === name)).filter(
      (it): it is SearchItem => Boolean(it),
    );
    return [{ title: "Popular", items: popular }];
  }
  const hits = items.filter((it) => {
    const hay = `${it.label} ${it.context} ${it.terms}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
  const labelHit = (it: SearchItem) => (it.label.toLowerCase().includes(words[0]) ? 0 : 1);
  const ranked = [...hits].sort((a, b) => labelHit(a) - labelHit(b));
  const groups: ResultGroup[] = [
    { title: "Commands", items: ranked.filter((it) => it.kind === "command").slice(0, PER_GROUP) },
    { title: "Docs", items: ranked.filter((it) => it.kind === "section").slice(0, PER_GROUP) },
  ];
  return groups.filter((g) => g.items.length > 0);
}

/** Splits text into plain and matched runs for highlighting. */
export function highlightRuns(text: string, words: string[]): { text: string; hit: boolean }[] {
  if (!words.length) return [{ text, hit: false }];
  const escaped = [...words].sort((a, b) => b.length - a.length).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const re = new RegExp(`(${escaped.join("|")})`, "gi");
  return text
    .split(re)
    .filter(Boolean)
    .map((part) => ({ text: part, hit: words.includes(part.toLowerCase()) }));
}
