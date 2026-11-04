import { describe, it, expect } from "vitest";
import { ChatInputCommandInteraction, InteractionContextType } from "discord.js";
import { buildArgs, buildCommand, SPEC_BY_NAME, SPECS } from "../../src/slash/registry";

/** An interaction whose options are exactly `values` (a user is `{ id }`). */
function fakeInteraction(values: Record<string, string | number | { id: string }>) {
  const get = (name: string) => (name in values ? values[name] : null);
  return {
    options: { getString: get, getInteger: get, getUser: get },
  } as unknown as ChatInputCommandInteraction;
}

function argsFor(name: string, values: Record<string, string | number | { id: string }>) {
  return buildArgs(fakeInteraction(values), SPEC_BY_NAME.get(name)!).args;
}

describe("slash registry", () => {
  it("registers every command as guild-only", () => {
    for (const spec of SPECS) {
      expect(buildCommand(spec).toJSON().contexts, `/${spec.name}`).toEqual([InteractionContextType.Guild]);
    }
  });

  // Each expectation is the positional args the handler parses, read off the
  // handler itself (bank execute, handleChicken, handleStock, handleBet,
  // handleCockFight, handleRussianRoulette).
  it.each([
    ["bank", { action: "fd", amount: "5k", days: 30 }, ["fd", "5k", "30"]],
    ["bank", { action: "investments" }, ["investments"]],
    ["chicken", { action: "train", value: "strength" }, ["train", "strength"]],
    ["chicken", { action: "name", value: "Sir Cluck" }, ["name", "Sir Cluck"]],
    ["stock", { action: "sell", symbol: "FRTN", quantity: 5 }, ["sell", "FRTN", "5"]],
    ["stock", { action: "portfolio" }, ["portfolio"]],
    ["bet", { amount: "100", choice: "red" }, ["100", "red"]],
    ["cockfight", { user: { id: "1" }, amount: "500" }, ["<@1>", "500"]],
    ["rr", { action: "start", amount: "1k" }, ["start", "1k"]],
    ["crew", { action: "invite", target: "Bob" }, ["invite", "Bob"]],
    ["crew", { action: "deposit", target: "5m" }, ["deposit", "5m"]],
    ["crew", {}, []],
  ] as const)("/%s %o serialises to the handler's args", (name, values, expected) => {
    expect(argsFor(name, values as any)).toEqual(expected);
  });
});
