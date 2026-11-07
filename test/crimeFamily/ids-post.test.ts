import { describe, it, expect, vi } from "vitest";
import { PermissionFlagsBits, Routes } from "discord.js";
import { CREW_IDS, CPR_IDS, TURF_IDS, cfId, decodeName, encodeName, parseCfId } from "../../src/ui/crimeFamily/ids";
import { channelLink, editChannelMessage, jumpLink, missingBotPermissions, sendToChannel } from "../../src/ui/crimeFamily/post";
import { buildNotice } from "../../src/ui/crimeFamily/kit";

const U = "12345678901234567890"; // 20-digit snowflakes
const T = "98765432109876543210";
const O = "65f0000000000000000000ff"; // 24-char ObjectId

describe("customIds", () => {
  const all = [
    CREW_IDS.view("invites", U), CREW_IDS.createOpen(U), CREW_IDS.createOk("WXYZ", "x".repeat(24), U), CREW_IDS.createNo(U),
    CREW_IDS.manageSelect(99, U), CREW_IDS.managePage(99, U), CREW_IDS.manage("promote", T, U), CREW_IDS.manage("demote", T, U), CREW_IDS.manage("kick", T, U),
    CREW_IDS.manage("chair", T, U), CREW_IDS.confirm("chair", "ok", T, U), CREW_IDS.confirm("leave", "no", "0", U),
    CREW_IDS.open("payday", U), CREW_IDS.openTarget("kick", T, U), CREW_IDS.openTarget("chair", T, U),
    CREW_IDS.vault("deposit", U), CREW_IDS.paydayOk(9_000_000_000_000_000, 12, U), CREW_IDS.levelOk(10, U),
    CREW_IDS.log(999, U), CREW_IDS.top("war", U), CREW_IDS.disband("open", U), CREW_IDS.modal("disband", U),
    CREW_IDS.inviteSelect(U), CREW_IDS.invite("decline", O), CREW_IDS.claim(O), CPR_IDS.viewPlan(U), TURF_IDS.viewMap(U),
    // Turf at max lengths: 20-digit owners, 24-char racket and war ObjectIds.
    TURF_IDS.viewWar(U), TURF_IDS.select(U), TURF_IDS.openRacket(O, U), TURF_IDS.bid(O, U),
    TURF_IDS.bidModal(O, U), TURF_IDS.scout(O), TURF_IDS.hit(O, "alleys"), TURF_IDS.hitAnswer(O, 3),
    // Votes and recruitment at their longest: 20-digit owners, 24-char ObjectIds, page 999.
    CREW_IDS.voteStart(U), CREW_IDS.voteOk(U), CREW_IDS.voteCancel(U), CREW_IDS.ballot("yes", O),
    CREW_IDS.board("act", true, 999, U), CREW_IDS.boardSelect(U), CREW_IDS.myApps(U), CREW_IDS.withdraw(U),
    CREW_IDS.familyCard(O, U), CREW_IDS.applyOpen(O, U), CREW_IDS.applyModal(O, U), CREW_IDS.recruit("toggle", U),
    CREW_IDS.recruitEdit({ netWorth: 10_000_000_000, shifts: 5_000, ageDays: 730, heists: 1_000 }, U), CREW_IDS.recruitModal(U),
    CREW_IDS.appAnswer("decline", O, U), CREW_IDS.inboxPage(999, U),
    // The intel relay (A18): cpr:share:<caperId>, 34 characters.
    CPR_IDS.share(O),
  ];

  it.each(all)("%s fits in 100 characters and round-trips", (id) => {
    expect(id.length).toBeLessThanOrEqual(100);
    const p = parseCfId(id)!;
    expect(p).not.toBeNull();
    expect([p.prefix, p.action, ...p.args].join(":")).toBe(id);
  });

  it("the longest id is create:ok at 73 characters and carries the name in base64url", () => {
    const id = CREW_IDS.createOk("WXYZ", "x".repeat(24), U);
    expect(id).toHaveLength(73);
    expect(decodeName(parseCfId(id)!.args[2])).toBe("x".repeat(24));
    expect(decodeName(encodeName("Velvet Ante's"))).toBe("Velvet Ante's");
  });

  it("the longest new id is recruitEdit at 59 characters (F10)", () =>
    expect(CREW_IDS.recruitEdit({ netWorth: 10_000_000_000, shifts: 5_000, ageDays: 730, heists: 1_000 }, U)).toHaveLength(59));

  it("racket ids replace racket keys: openRacket 62, bid 54, bidModal 60 characters (6.8)", () => {
    expect([TURF_IDS.openRacket(O, U), TURF_IDS.bid(O, U), TURF_IDS.bidModal(O, U)].map((id) => id.length)).toEqual([62, 54, 60]);
  });

  it("pins the S2 Caper and Turf ids", () => {
    expect(CPR_IDS.viewPlan(U)).toBe(`cpr:v:plan:${U}`);
    expect(TURF_IDS.viewMap(U)).toBe(`turf:v:map:${U}`);
  });

  it("rejects foreign or bare ids and refuses ids over 100 characters", () => {
    expect(parseCfId("crime:x")).toBeNull();
    expect(parseCfId("crew")).toBeNull();
    expect(() => cfId("crew", "x".repeat(100))).toThrow();
  });
});

describe("channel I/O", () => {
  const payload = buildNotice("Hello");
  function fake(fail: { send?: unknown; edit?: unknown } = {}) {
    const rest = {
      post: vi.fn(async () => { if (fail.send) throw fail.send; return { id: "m1" }; }),
      patch: vi.fn(async () => { if (fail.edit) throw fail.edit; return {}; }),
    };
    const client = { options: {}, rest, channels: { fetch: vi.fn() } } as any;
    return { client, rest };
  }

  it("sends and edits without fetching the message", async () => {
    const { client, rest } = fake();
    expect(await sendToChannel(client, "c1", payload)).toBe("m1");
    expect(await editChannelMessage(client, "c1", "m9", payload)).toBe("ok");
    expect(rest.patch).toHaveBeenCalledTimes(1);
    expect(rest.patch.mock.calls[0][0]).toBe(Routes.channelMessage("c1", "m9"));
    expect(client.channels.fetch).not.toHaveBeenCalled();
  });

  it.each([10003, 10008, 50001, 50013])("a dead board (%i) is null / \"dead\" and never throws", async (code) => {
    const err = Object.assign(new Error("dead"), { code });
    for (const where of ["send", "edit"] as const) {
      const { client } = fake({ [where]: err });
      await expect(sendToChannel(client, "c1", payload)).resolves.toBe(where === "edit" ? "m1" : null);
      await expect(editChannelMessage(client, "c1", "m1", payload)).resolves.toBe(where === "send" ? "ok" : "dead");
    }
  });

  it("any other error is null / \"error\" and never throws", async () => {
    const err = Object.assign(new Error("boom"), { code: 500 });
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { client } = fake({ send: err, edit: err });
    await expect(sendToChannel(client, "c1", payload)).resolves.toBeNull();
    await expect(editChannelMessage(client, "c1", "m1", payload)).resolves.toBe("error");
    spy.mockRestore();
  });

  it("missingBotPermissions names what the bot lacks", () => {
    const granted: bigint[] = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages];
    const channel = { permissionsFor: (id: string) => (id === "bot" ? { has: (bit: bigint) => granted.includes(bit) } : null) } as any;
    expect(missingBotPermissions(channel, "bot")).toEqual(["Read Message History", "Attach Files"]);
    expect(missingBotPermissions(channel, "other")).toEqual(["View Channel", "Send Messages", "Read Message History", "Attach Files"]);
  });

  it("jumpLink points at the message", () => {
    expect(jumpLink("g", "c", "m")).toBe("https://discord.com/channels/g/c/m");
  });

  it("channelLink points at the channel", () => {
    expect(channelLink("1", "2")).toBe("https://discord.com/channels/1/2");
  });
});
