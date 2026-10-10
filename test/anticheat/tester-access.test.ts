import { describe, it, expect } from "vitest";
import { Collection } from "discord.js";
import { BOT_DEVELOPER_ID, isTester, isTesterMember } from "../../src/utils/developerAccess";

// isTester used to accept any role NAMED "tester" in any server. Anyone could
// create a server and that role, then buy from the shop for free.

function memberWithRole(id: string, roleId: string, roleName: string): any {
  const roles = new Collection<string, { id: string; name: string }>([[roleId, { id: roleId, name: roleName }]]);
  return { id, roles: { cache: roles } };
}

describe("isTester", () => {
  it("does not trust a role just because it is named tester", () => {
    const member = memberWithRole("123456789012345678", "999999999999999999", "Tester");
    expect(isTester(member.id, member)).toBe(false);
    expect(isTesterMember(member)).toBe(false);
  });

  it("still recognises the allowlisted developers", () => {
    expect(isTester(BOT_DEVELOPER_ID)).toBe(true);
  });
});
