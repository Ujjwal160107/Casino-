/**
 * The landing FAQ. One array feeds both the visible accordion and the FAQPage
 * structured data, so the two can never disagree. An answer is a run of
 * segments: plain text, an inline command, or an internal link.
 */

export type FaqSegment = string | { cmd: string } | { href: string; label: string };

export interface FaqItem {
  q: string;
  a: FaqSegment[];
}

export const FAQ: FaqItem[] = [
  { q: "Is Fortuna free to play?", a: ["Yes. Add it to your server and run ", { cmd: "!start" }, "."] },
  {
    q: "Does my progress carry between servers?",
    a: ["Yes. Everything is tied to your Discord account: wallet, bank, job, degrees, credit card, zoo and family."],
  },
  {
    q: "Can I join a family from another server?",
    a: [
      "Yes. Families are global. Find one on ",
      { cmd: "!crew board" },
      ", apply, and play crew heists and turf wars from any server or from the bot's DMs.",
    ],
  },
  {
    q: "Where can I see the odds and payouts?",
    a: ["In the ", { href: "/docs", label: "docs" }, ". Every payout, odd, cooldown and limit is published there."],
  },
];

/** An answer as plain text, exactly as it reads on the page. */
export function faqAnswerText(a: FaqSegment[]) {
  return a.map((s) => (typeof s === "string" ? s : "cmd" in s ? s.cmd : s.label)).join("");
}
