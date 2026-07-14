import assert from "node:assert/strict";
import { ActiveItemEffectView, formatActiveItemEffectList } from "../services/activeItemEffectService";

const effects: ActiveItemEffectView[] = [
  {
    key: "lucky_coin",
    itemName: "Lucky Coin",
    emoji: "🪙",
    kind: "Buff",
    detail: "Next game payout +50%",
    expiresAt: new Date("2026-07-14T12:00:00.000Z"),
  },
  {
    key: "devil_contract",
    itemName: "Devil Contract",
    emoji: "😈",
    kind: "Debuff",
    detail: "Income -20% · 2 events left",
    expiresAt: null,
  },
];

const output = formatActiveItemEffectList(effects);
assert.match(output, /^1\. 🪙 \*\*Lucky Coin\*\* — \*\*Buff\*\*/);
assert.match(output, /ends <t:1784030400:R>/);
assert.match(output, /2\. 😈 \*\*Devil Contract\*\* — \*\*Debuff\*\*/);
assert.match(output, /until consumed$/);

assert.equal(
  formatActiveItemEffectList([]),
  "- No active item buffs or debuffs.",
);

const truncated = formatActiveItemEffectList(effects, 130);
assert.match(truncated, /more active item effect/);
assert.ok(truncated.length <= 150, "Truncated profile effect list stays compact.");

const crowdedProfile = formatActiveItemEffectList(
  Array.from({ length: 40 }, (_, index): ActiveItemEffectView => ({
    key: `item_${index}`,
    itemName: `Item ${index}`,
    emoji: "✨",
    kind: index % 2 === 0 ? "Buff" : "Debuff",
    detail: "A deliberately verbose active effect description for payload-limit coverage",
    expiresAt: new Date(1_800_000_000_000 + index * 1_000),
  })),
);
assert.ok(crowdedProfile.length <= 2_350, "Crowded profile effect list stays below its payload budget.");
assert.match(crowdedProfile, /more active item effects/);

console.log("active item effect formatting tests passed.");
