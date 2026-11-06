import { describe, it, expect } from "vitest";
import { buildVoteCard, buildVoteSeatCard, buildVoteStartConfirm } from "../../src/ui/crimeFamily/voteScreens";
import type { VoteView } from "../../src/services/crimeFamily/views";
import { visibleText } from "./visibleText";
import { countComponents } from "./layoutHelpers";

const base: VoteView = {
  voteId: "65f0000000000000000000aa", familyId: "65f0000000000000000000ff", familyLabel: "[VLA] Velvet Ante", tag: "VLA",
  homeChannelId: "c", channelId: "c", messageId: "m", bossId: "1", starterId: "2", status: "OPEN", closesAt: new Date(Date.now() + 3_600_000),
  eligible: 29, need: 20, voted: 11, heirId: "3", result: null, viewerCanVote: true,
};

describe("vote screens (amendment 4.6)", () => {
  it("S34 open: 7 components, counts only, nobody's choice", () => {
    const p = buildVoteCard(base);
    expect(countComponents(p)).toBe(7);
    const t = visibleText(p);
    expect(t).toContain("11 of 29 have voted");
    expect(t).toContain("needs **20** YES");
    expect(t).toContain("<@3> takes the chair");
    expect(p.allowedMentions).toEqual({ parse: [] });
  });
  it("S34 result variants: 3 components each", () => {
    const passed = buildVoteCard({ ...base, status: "PASSED", result: { yes: 21, no: 6, newBossId: "3", voidReason: null } });
    expect(countComponents(passed)).toBe(3);
    expect(visibleText(passed)).toContain("Passed: <@3> is Boss (YES 21, NO 6, eligible 29)");
    expect(visibleText(buildVoteCard({ ...base, status: "VOID", result: { yes: 0, no: 0, newBossId: "", voidReason: "chair_moved" } }))).toContain("Void: the chair changed hands.");
  });
  it("S35 is 6 and S25 vote is 5; a blocked S35 disables Start", () => {
    const s35 = buildVoteStartConfirm({ ownerId: "2", familyLabel: "[VLA] Velvet Ante", bossId: "1", eligible: 29, need: 20, openVoteId: null, block: "A vote is already open." });
    expect(countComponents(s35)).toBe(6);
    expect(JSON.stringify(s35.components[0].toJSON())).toMatch(/"disabled":true/);
    expect(countComponents(buildVoteSeatCard(base))).toBe(5);
  });
});
