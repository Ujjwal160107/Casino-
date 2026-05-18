export const BOT_DEVELOPER_ID = "1288340046449086567";

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
  return userId === BOT_DEVELOPER_ID;
}

export function isDeveloperOnlyCommand(command: string) {
  return ADMIN_COMMANDS.has(command.toLowerCase());
}
