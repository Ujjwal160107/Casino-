import type { GuildMember } from "discord.js";

export const BOT_DEVELOPER_ID = "1288340046449086567";

export const BOT_DEVELOPER_IDS = new Set<string>([
  BOT_DEVELOPER_ID,
  "761118244198285313",
]);

// Testing role: these users bypass cooldowns, can buy anything regardless of balance,
// and have access to all admin commands.
export const TESTER_IDS = new Set<string>([]);

export const TESTER_ROLE_IDS = new Set<string>([
  // Add tester role IDs here. Users with any of these roles bypass cooldowns and shop costs.
]);

export function isTester(userId: string, member?: GuildMember | null): boolean {
  if (member && TESTER_ROLE_IDS.size > 0) {
    const hasTesterRole = [...TESTER_ROLE_IDS].some((roleId) => member.roles.cache.has(roleId));
    if (hasTesterRole) return true;
  }
  if (member) {
    const hasTesterName = member.roles.cache.some((role) => {
      const name = role.name.toLowerCase();
      return name === "tester" || name === "testers";
    });
    if (hasTesterName) return true;
  }
  return TESTER_IDS.has(userId) || isBotDeveloper(userId);
}

export function isTesterMember(member?: GuildMember | null): boolean {
  if (!member) return false;
  return isTester(member.id, member);
}

export const DEVELOPER_ONLY_COMMAND_MESSAGE = "This command is restricted to the bot developer.";

const ADMIN_COMMANDS = new Set([
  "addemoji", "add-emoji", "setemoji", "set-emoji",
  "add-money", "addmoney", "admin-add", "adminadd",
  "set-money", "setmoney",
  "remove-money", "removemoney", "remove", "take-money", "takemoney",
  "reset-economy", "reseteconomy",
  "shop-add", "shopadd", "add-shop-item", "addshopitem",
  "manage-item", "manageitem", "edit-item", "edititem", "del-item", "delitem",
  "edit-shop", "editshop", "delete-shop", "deleteshop",
  "remove-item", "removeitem", "delete-item", "deleteitem", "remove-inv", "removeinv", "clear-inv", "clearinv",
  "reset-shop", "resetshop", "reset-store", "resetstore",
  "global-announcement-preview", "globalannouncementpreview", "fortuna-global-preview", "fortunaglobalpreview",
  "global-announcement-send", "globalannouncementsend", "fortuna-global-send", "fortunaglobalsend",
  "set-credit-score", "setcreditscore",
  "test", "testwelcome",
  "adminpanel", "admin-panel",
  "factory-reset", "factoryreset",
  "manage-property", "manageproperty", "property-admin", "propertyadmin",
  "setint", "set-int", "setintelligence",
  "setdis", "set-dis", "setdiscipline",
  "resetedu", "reset-edu",
  "grantdegree", "grant-degree",
  "set-degree-cost", "setdegreecost", "setdegree", "settuition"
]);

export function isBotDeveloper(userId: string) {
  return BOT_DEVELOPER_IDS.has(userId);
}

export function isDeveloperOnlyCommand(command: string) {
  return ADMIN_COMMANDS.has(command.toLowerCase());
}
