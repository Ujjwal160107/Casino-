import { getModuleDoc } from "@/content/modules";

/**
 * Reads the numbers the How-it-plays tiles show straight out of the module
 * docs, so the landing page can never drift from the docs. Server-side only:
 * the module docs are large, so HowItPlays (a server component) calls these
 * and hands the client tiles plain props.
 */

function table(slug: string, title: string) {
  const t = getModuleDoc(slug)?.sections.find((s) => s.table?.title === title)?.table;
  if (!t) throw new Error(`landing tiles: no "${title}" table in module ${slug}`);
  const col = (name: string) => {
    const i = t.columns.indexOf(name);
    if (i < 0) throw new Error(`landing tiles: no "${name}" column in ${slug} / ${title}`);
    return i;
  };
  const row = (match: (r: string[]) => boolean, label: string) => {
    const r = t.rows.find(match);
    if (!r) throw new Error(`landing tiles: no ${label} row in ${slug} / ${title}`);
    return r;
  };
  return { col, row };
}

/** "55,000" → 55000. */
const num = (s: string) => Number(s.replace(/,/g, ""));

/** economy.ts: "New accounts start with exactly 1,000 Fortunes". */
export const STARTING_WALLET = 1000;

export function workShiftFacts() {
  const jobs = table("jobs-and-careers", "All 21 jobs");
  const pay = jobs.col("Pay/shift");
  const waiter = jobs.row((r) => r[0] === "Waiter", "Waiter");
  const next = jobs.row((r) => r[jobs.col("Previous job")] === "Waiter", "Waiter promotion");
  return {
    pay: num(waiter[pay]),
    nextJob: next[0],
    nextJobPay: num(next[pay]),
    shiftsForPromotion: num(next[jobs.col("Lifetime Shifts")]),
    startWallet: STARTING_WALLET,
  };
}

export type CardTierFacts = { name: string; face: string; limit: string; weeklyInterest: string };

/** The three tiers that have card-face art (STARTER has none yet). */
export function cardTierFacts(): CardTierFacts[] {
  const tiers = table("bank-and-credit", "Card tiers");
  return (["GOLD", "PLATINUM", "BLACK"] as const).map((name) => {
    const r = tiers.row((x) => x[0] === name, name);
    return {
      name,
      face: `/cards/${name.toLowerCase()}_card_face.webp`,
      limit: r[tiers.col("Limit")],
      weeklyInterest: r[tiers.col("Weekly interest")],
    };
  });
}

export type DeedFacts = { name: string; img: string; basePrice: string; rent: string };

/** The four deeds with art, cheapest first (the Apartment has no art yet). */
export function deedFacts(): DeedFacts[] {
  const deeds = table("investments", "Property catalog");
  return [
    ["Shack", "/art/shack.webp"],
    ["House", "/art/house.webp"],
    ["Mansion", "/art/mansion.webp"],
    ["Private Island", "/art/private-island.webp"],
  ].map(([name, img]) => {
    const r = deeds.row((x) => x[0] === name, name);
    return { name, img, basePrice: r[deeds.col("Base price")], rent: r[deeds.col("Rent / 24h")] };
  });
}
