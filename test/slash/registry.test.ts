import { describe, it, expect } from "vitest";
import { InteractionContextType } from "discord.js";
import { buildCommand, SPECS } from "../../src/slash/registry";

describe("slash registry", () => {
  it("registers every command as guild-only", () => {
    for (const spec of SPECS) {
      expect(buildCommand(spec).toJSON().contexts, `/${spec.name}`).toEqual([InteractionContextType.Guild]);
    }
  });
});
