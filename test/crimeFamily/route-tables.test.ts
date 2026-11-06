// test/crimeFamily/route-tables.test.ts: loads a route module before crewInteractionHandler (the import-cycle guard)
import { describe, it, expect } from "vitest";
import { VOTE_ROUTES } from "../../src/handlers/crewVoteRoutes";
import { RECRUIT_ROUTES } from "../../src/handlers/crewRecruitRoutes";
import { handleCrimeFamilyInteraction } from "../../src/handlers/crimeFamilyRouter";
import { CREW_IDS } from "../../src/ui/crimeFamily/ids";
import { fakeButton, said } from "./fakeInteraction";
import { withCfConfig, seedEligibleUser, resetFamilies } from "../helpers";

describe("route tables (Task 11)", () => {
  it("crew:vt:start routes even when crewVoteRoutes is the first route module loaded", async () => {
    await resetFamilies();
    expect(VOTE_ROUTES["vt:start"]).toBeDefined();
    const uid = await seedEligibleUser();
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.voteStart(uid), { userId: uid, ephemeralSource: true });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).not.toContain("This button is no longer active.");
      expect(said(i)).toContain("You are not in a crime family.");
    });
  });
});

describe("route tables (Task 15)", () => {
  it("crew:bd routes to the board, never the no-route refusal", async () => {
    await resetFamilies();
    expect(RECRUIT_ROUTES.bd).toBeDefined();
    const uid = await seedEligibleUser();
    await withCfConfig({ enabled: true }, async () => {
      const i = fakeButton(CREW_IDS.board("lvl", false, 0, uid), { userId: uid, ephemeralSource: true });
      await handleCrimeFamilyInteraction(i as any);
      expect(said(i)).not.toContain("This button is no longer active.");
      expect(said(i)).toContain("Families recruiting");
    });
  });
});
