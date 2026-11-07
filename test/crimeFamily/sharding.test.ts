// test/crimeFamily/sharding.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import cron from "node-cron";
import { readFileSync } from "node:fs";
import { isJobShard } from "../../src/utils/shard";
import { CF_SCHEDULES, startCrimeFamilyJobs } from "../../src/services/crimeFamily/scheduler";
import { editChannelMessage, sendToChannel } from "../../src/ui/crimeFamily/post";
import { buildNotice } from "../../src/ui/crimeFamily/kit";
import { recordProcessBoot, bootedSince } from "../../src/services/processBootService";
import { fakeClient } from "./fakeClient";
import { resetFamilies } from "../helpers";

vi.mock("../../src/services/crimeFamily/turfCities", async (orig) => ({ ...(await orig<object>()), seedTurf: vi.fn(async () => undefined) }));
beforeEach(resetFamilies);

describe("one job shard (A29)", () => {
  it.each([[null, true], [{ ids: [0] }, true], [{ ids: [0, 1] }, true], [{ ids: [1] }, false]])("shard %j → %s", (shard, want) => {
    expect(isJobShard({ shard: shard as any })).toBe(want);
  });
  it("registers every family schedule on the job shard and none elsewhere", () => {
    const spy = vi.spyOn(cron, "schedule").mockImplementation(() => ({}) as any);
    startCrimeFamilyJobs({ shard: { ids: [1] } } as any);
    expect(spy).not.toHaveBeenCalled();
    startCrimeFamilyJobs({ shard: null } as any);
    expect(spy).toHaveBeenCalledTimes(CF_SCHEDULES.length);
    spy.mockRestore();
  });
  it("initScheduler registers family jobs only through startCrimeFamilyJobs", () => {
    const src = readFileSync("src/scheduler.ts", "utf8");
    expect(src).toContain("startCrimeFamilyJobs(client)");
    expect(src).not.toMatch(/registerCrimeFamilyJobs\(|seedTurf\(/);
  });
});

describe("REST seam (A28)", () => {
  it("posts and edits through client.rest for a guild this process does not cache", async () => {
    const fc = fakeClient();
    (fc.client as any).guilds = { cache: new Map() };
    const id = await sendToChannel(fc.client as any, "c-far", buildNotice("hello"));
    expect(id).toBe("m1");
    expect(await editChannelMessage(fc.client as any, "c-far", "m1", buildNotice("edited"))).toBe("ok");
    expect(fc.calls.map((c) => [c.op, c.channelId])).toEqual([["send", "c-far"], ["edit", "c-far"]]);
    expect(fc.calls[0].payload.allowed_mentions).toEqual({ parse: [] });
    expect((fc.client as any).channels.fetch).not.toHaveBeenCalled();
  });
  it("a dead channel (REST 10003) marks the board dead", async () => {
    const fc = fakeClient({ dead: true });
    expect(await editChannelMessage(fc.client as any, "c1", "m9", buildNotice("x"))).toBe("dead");
    expect(await sendToChannel(fc.client as any, "c1", buildNotice("x"))).toBeNull();
  });
});

describe("process boots (A30)", () => {
  it("bootedSince sees a boot written by another shard", async () => {
    const t = new Date();
    expect(await bootedSince(t)).toBe(false);
    await recordProcessBoot({ shard: { ids: [3] } }, new Date(+t + 1_000));
    expect(await bootedSince(t)).toBe(true);
  });
});
