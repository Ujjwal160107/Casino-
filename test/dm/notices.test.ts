import { describe, it, expect } from "vitest";
import { Client } from "discord.js";
import {
  sendDm,
  robbedNotice,
  padlockNotice,
  taxRaidNotice,
} from "../../src/services/dmNoticeService";
import { Mascot, getEmoteUrl } from "../../src/config/branding";
import { fmtCurrency } from "../../src/utils/format";
import { containerText, containerThumb, fakeDmClient } from "./helpers";

describe("sendDm", () => {
  const anyNotice = () => robbedNotice("R", 1, null);

  it("returns true when Discord accepts the message", async () => {
    const { client, sent } = fakeDmClient();
    expect(await sendDm(client, "u1", anyNotice())).toBe(true);
    expect(sent.get("u1")).toBe(1);
  });

  it("returns false when the DM is closed", async () => {
    const { client } = fakeDmClient(["u1"]);
    expect(await sendDm(client, "u1", anyNotice())).toBe(false);
  });

  it("returns false when the user cannot be fetched", async () => {
    const client = { users: { fetch: async () => { throw new Error("Unknown User"); } } } as unknown as Client;
    expect(await sendDm(client, "u1", anyNotice())).toBe(false);
  });
});

describe("security notices", () => {
  it("robbed: gun thumbnail, robber, amount, server, bank hint", () => {
    const c = robbedNotice("Vex", 12_345, "Casino Lounge");
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Gun));
    const t = containerText(c);
    expect(t).toContain("## You've been robbed!");
    expect(t).toContain(`**Vex** lifted **${fmtCurrency(12_345)}** from your wallet in **Casino Lounge**.`);
    expect(t).toContain("-# Wallet money can be robbed. Bank what you don't need with `!deposit`.");
  });

  it("robbed: no server clause when the guild is unknown", () => {
    const t = containerText(robbedNotice("Vex", 5, null));
    expect(t).toContain("from your wallet.");
    expect(t).not.toContain(" in **");
  });

  it("padlock: lock thumbnail and single-use hint", () => {
    const c = padlockNotice("Vex", "Casino Lounge");
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Lock));
    const t = containerText(c);
    expect(t).toContain("## Your Padlock just paid for itself.");
    expect(t).toContain("**Vex** tried to rob you in **Casino Lounge**. The padlock blocked the hit and broke in the process.");
    expect(t).toContain("-# Padlocks are single-use. Grab another: `!shop buy padlock`.");
  });

  it("tax raid: police thumbnail, seized and remaining amounts as currency, heat hint", () => {
    const c = taxRaidNotice(250_000, 750_000);
    expect(containerThumb(c)).toBe(getEmoteUrl(Mascot.Emotes.Police));
    const t = containerText(c);
    expect(t).toContain("## Tax raid");
    expect(t).toContain(`**Seized:** ${fmtCurrency(250_000)}`);
    expect(t).toContain(`**Wallet now:** ${fmtCurrency(750_000)}`);
    expect(t).toContain("Your criminal heat has been reset.");
    expect(t).toContain("-# Heat builds from crime and robbery. Check it with `!heat`.");
  });
});
