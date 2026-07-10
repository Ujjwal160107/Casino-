import { Client, Message } from "discord.js";
import prisma from "./utils/prisma";
import { checkJailStatus } from "./services/jailService";
import { handleHelp } from "./commands/general/help";
import { handleCasinoGuide } from "./commands/general/casinoGuide";
import { handleTutorial } from "./commands/general/tutorial";
import { handleSetPrefix } from "./commands/admin/setPrefix";
import { handleAddEmoji } from "./commands/admin/addEmoji";
import { handleBalance } from "./commands/economy/balance";
import { handleDeposit } from "./commands/economy/deposit";
import { handleWithdrawBank } from "./commands/economy/withdrawBank";
import { handleTransfer } from "./commands/economy/transfer";
import { handleIncome } from "./commands/economy/incomeCommands";
import { handleRob } from "./commands/economy/rob";
import { handleShop } from "./commands/economy/shop";
import { handleInventory } from "./commands/economy/inventory";
import {
  propertiesHandler,
  buyPropertyHandler,
  sellPropertyHandler,
  myPropertiesHandler,
  collectRentHandler
} from "./commands/economy/properties";
import { handleProfile } from "./commands/economy/profile";
import { handleLeaderboard } from "./commands/economy/leaderboard";
import { execute as handleBank } from "./commands/economy/bank";
import { handleMarket } from "./commands/economy/market";
import { handleDaily } from "./commands/economy/daily";
import { handleWeekly } from "./commands/economy/weekly";
import { handleMonthly } from "./commands/economy/monthly";
import { handleAddMoney } from "./commands/admin/addMoney";
import { handleSetMoney } from "./commands/admin/setMoney";
import { handleRemoveMoney } from "./commands/admin/removeMoney";
import { handleResetEconomy } from "./commands/admin/resetEconomy";
import { handleGlobalAnnouncementPreview, handleGlobalAnnouncementSend } from "./commands/admin/globalAnnouncement";
import { handleBet, handleRouletteMenu } from "./commands/games/roulette";
import { handleBlackjack } from "./commands/games/blackjack";
import { handleCoinflip } from "./commands/games/coinflip";
import { handleRussianRoulette } from "./commands/games/russianRoulette";
import { handleSlots } from "./commands/games/slots";
import { handleCockFight } from "./commands/games/cockfight";
import { errorEmbed } from "./utils/embed";
import { findBestMatch } from "./utils/stringUtils";
import { handleUse } from "./commands/economy/use";
import { handleItemInfo } from "./commands/economy/iteminfo";
import { Mascot, getEmoteUrl } from "./config/branding";
import { handleCrime } from "./commands/economy/crime";
import { handleJail, handleBail } from "./commands/economy/jail";
import { handleHunt } from "./commands/games/hunt";
import { handleZoo } from "./commands/games/zoo";
import {
  DEVELOPER_ONLY_COMMAND_MESSAGE,
  isBotDeveloper,
  isDeveloperOnlyCommand,
  isTester,
} from "./utils/developerAccess";

const STORE_MOVED_MESSAGE = "This store has moved to the main shop system and is temporarily unavailable.";
const LEGACY_SYSTEM_REMOVED_MESSAGE = "This legacy server-specific command has been removed in Fortuna V2.";

const LEGACY_REMOVED_COMMANDS = new Set([
  "collect",
  "setincome", "set-income",
  "set-income-cooldown", "setincomecooldown", "set-income-cd", "setincomecd",
  "setrob", "set-rob", "config-rob",
  "setcurrencyemoji", "set-currency-emoji", "setemoji", "set-emoji",
  "set-currency", "setcurrency",
  "set-start-money", "setstartmoney", "set-start", "setstart",
  "set-global-game-cooldown", "setglobalgamecooldown", "set-global-cd", "setglobalcd",
  "set-game-cooldown", "setgamecooldown", "set-game-cd", "setgamecd", "game-cd", "gamecd",
  "min-bet", "minbet", "set-min-bet", "setminbet",
  "set-bet-limit", "setbetlimit", "betlimit", "betlimits", "bet-limit",
  "admin-view-config", "adminviewconfig", "view-config", "viewconfig",
  "casino-ban", "casinoban", "ban-user", "banuser",
  "casino-unban", "casinounban", "unban-user", "unbanuser",
  "casino-ban-list", "casinobanlist", "ban-list", "banlist",
  "set-loan-interest", "setloaninterest", "set-loan", "setloan",
  "set-bank-limit", "setbanklimit", "set-wallet-limit", "setwalletlimit",
  "set-daily", "setdaily", "set-daily-amount", "setdailyamount",
  "set-weekly", "setweekly", "set-weekly-amount", "setweeklyamount",
  "set-monthly", "setmonthly", "set-monthly-amount", "setmonthlyamount",
  "set-fd-interest", "setfdinterest", "set-fd", "setfd",
  "set-rd-interest", "setrdinterest", "set-rd", "setrd",
  "set-tax", "settax", "market-tax", "markettax",
  "set-log-channel", "setlogchannel", "set-logs", "setlogs", "log-channel", "logchannel",
  "chatmoney", "chat-money", "cm",
  "set-casino-channel", "setcasinochannel", "casino-channel", "casinochannel",
  "make-casino-admin", "makecasinoadmin", "promote-casino-admin", "promotecasinoadmin", "casino-admin-add", "casinoadminadd",
  "remove-casino-admin", "removecasinoadmin", "demote-casino-admin", "demotecasinoadmin",
  "casino-admins-list", "casinoadminslist", "casino-admins", "casinoadmins",
  "config-jobs", "configjobs", "config-job", "configjob", "set-job-salary", "setjobsalary",
  "setup", "config", "admin-setup", "adminsetup",
  "adminpanel", "admin-panel",
  "reset-admin-settings", "resetadminsettings", "reset-permissions", "resetpermissions", "reset-perms", "resetperms", "reset-access", "resetaccess",
  "setup-drop", "setupdrop", "config-drop", "drop-setup", "drop", "manual-drop", "spawn-drop",
  "set-cockfight", "setcockfight", "set-chicken", "setchicken", "manage-chicken", "managechicken",
  "set-study-cooldown", "setstudycooldown", "set-study-cd", "setstudycd",
  "add-credit-tier", "addcredittier", "config-credit-tier", "configcredittier",
  "view-credit-tiers", "viewcredittiers", "delete-credit-tier", "deletecredittier",
  "loan-ban", "loanban", "loan-unban", "loanunban", "reset-loans", "resetloans",
  "factory-reset", "factoryreset",
  "test",
  "shop-add", "add-shop-item", "addshopitem",
  "manage-item", "edit-item", "del-item", "edit-shop", "delete-shop",
  "remove-item", "delete-item", "remove-inv", "clear-inv",
  "reset-shop", "resetshop", "reset-store", "resetstore",
  "manage-property", "manageproperty", "property-admin", "propertyadmin",
  "set-degree-cost", "setdegreecost", "setdegree", "settuition",
]);

function normalizeCommand(command: string, args: string[]) {
  let normalized = command.toLowerCase();

  if (normalized === "set" && args[0]?.toLowerCase() === "casino" && args[1]?.toLowerCase() === "channel") {
    normalized = "set-casino-channel";
    args.splice(0, 2);
  }
  if ((normalized === "set" && args[0]?.toLowerCase() === "casinochannel") || normalized === "setcasinochannel") {
    normalized = "set-casino-channel";
    if (command !== "setcasinochannel") args.shift();
  }
  if (normalized === "set" && args[0]?.toLowerCase() === "prefix") {
    normalized = "setprefix";
    args.shift();
  }
  if (normalized === "channel" && args[0]?.toLowerCase() === "override") {
    normalized = "channel-override";
    args.shift();
  }
  if (normalized === "channeloverride") normalized = "channel-override";
  if (normalized === "bot" && args[0]?.toLowerCase() === "commander") {
    normalized = "bot-commander";
    args.shift();
  }
  if (normalized === "botcommander") normalized = "bot-commander";
  if (normalized === "command" && args[0]?.toLowerCase() === "status") {
    normalized = "command-status";
    args.shift();
  }
  if (normalized === "commandstatus") normalized = "command-status";

  return ({
    dep: "deposit",
    depo: "deposit",
    me: "profile",
    userinfo: "profile",
    p: "profile",
    bal: "balance",
    b: "balance",
    with: "withdraw",
    wd: "withdraw",
    add: "add-money",
    addmoney: "add-money",
    adminadd: "add-money",
    remove: "remove-money",
    removemoney: "remove-money",
    take: "remove-money",
    setstart: "set-start-money",
    setstartmoney: "set-start-money",
    inv: "inventory",
    lb: "leaderboard",
    top: "leaderboard",
    rich: "leaderboard",
    "lb-wallet": "lb-wallet",
    lbwallet: "lb-wallet",
    cashlb: "lb-wallet",
    roulette: "bet",
    roul: "bet",
    bj: "blackjack",
    cf: "coinflip",
    chicken: "chicken"
  } as Record<string, string>)[normalized] ?? normalized;
}

async function getUserRecord(message: Message) {
  if (!message.author.id || !message.guildId) return null;

  const user = await prisma.user.findUnique({
    where: { discordId: message.author.id }
  });

  if (!user?.isBanned) return user;

  if (user.banExpiresAt) {
    if (new Date() > user.banExpiresAt) {
      await prisma.user.update({
        where: { discordId: user.discordId },
        data: { isBanned: false, banExpiresAt: null }
      });
      return { ...user, isBanned: false, banExpiresAt: null };
    }

    await message.reply({
      embeds: [
        errorEmbed(
          message.author,
          "Banned",
          `You are banned from the casino until <t:${Math.floor(user.banExpiresAt.getTime() / 1000)}:R>.`
        )
      ]
    });
    return "blocked";
  }

  await message.reply({
    embeds: [errorEmbed(message.author, "Banned", "You are permanently banned from the casino.")]
  });
  return "blocked";
}

export async function routeMessage(client: Client, message: Message, prefix: string) {
  const raw = message.content.slice(1).trim();
  const [cmd, ...args] = raw.split(/\s+/);
  const normalized = normalizeCommand(cmd, args);

  const user = await getUserRecord(message);
  if (user === "blocked") return;

  const developerOnlyCommand = isDeveloperOnlyCommand(normalized);
  const botDeveloper = isBotDeveloper(message.author.id) || isTester(message.author.id);

  if (developerOnlyCommand && !botDeveloper) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Developer Only", DEVELOPER_ONLY_COMMAND_MESSAGE)]
    });
  }

  if (LEGACY_REMOVED_COMMANDS.has(normalized)) {
    return message.reply({
      embeds: [errorEmbed(message.author, "Removed Command", LEGACY_SYSTEM_REMOVED_MESSAGE)]
    });
  }

  const restrictedInJail = new Set([
    "work", "crime", "beg", "slut", "rob", "shop", "buy", "sell", "market",
    "bet", "blackjack", "roulette", "slots", "coinflip", "cockfight", "chicken",
    "withdraw", "deposit", "transfer", "daily", "weekly", "monthly", "bank", "card",
    "invest", "stock", "trade"
  ]);

  if (restrictedInJail.has(normalized) && user) {
    const { isJailed } = await checkJailStatus(user.discordId);
    if (isJailed) {
      return message.reply({
        embeds: [
          errorEmbed(
            message.author,
            `${Mascot.Emotes.Lock} You are in Jail`,
            `You cannot perform this action while incarcerated. Use \`${prefix}jail\` to check your status or \`${prefix}bail\` to pay your way out.`
          )
        ]
      });
    }
  }

  switch (normalized) {
    case "addemoji":
      return handleAddEmoji(message, args);
    case "ping":
    case "latency": {
      const { handlePing } = require("./commands/general/ping");
      return handlePing(message);
    }
    case "help":
      return handleHelp(message);
    case "casino":
    case "games":
    case "casinoguide":
    case "casino-guide":
      return handleCasinoGuide(message);
    case "guide":
    case "tutorial":
      return handleTutorial(message);
    case "setprefix":
    case "set-prefix":
      return handleSetPrefix(message, args);
    case "start": {
      const { handleStart } = require("./commands/general/start");
      return handleStart(message);
    }
    case "balance":
      return handleBalance(message);
    case "bank":
      return handleBank(message, args);
    case "card":
    case "creditcard":
    case "credit-card": {
      const { handleCard } = require("./commands/economy/card");
      return handleCard(message, args);
    }
    case "my cards":
    case "my-cards":
    case "mycard": {
      const { handleMyCards } = require("./commands/economy/card");
      return handleMyCards(message);
    }
    case "deposit":
      return handleDeposit(message, args);
    case "withdraw":
      return handleWithdrawBank(message, args);
    case "transfer":
    case "give":
      return handleTransfer(message, args);
    case "crime":
      return handleCrime(message);
    case "beg":
    case "slut":
      return handleIncome(message);
    case "jail":
    case "status":
      return handleJail(message);
    case "bail":
    case "release":
    case "paybail":
    case "pay-bail":
      return handleBail(message);
    case "daily":
      return handleDaily(message);
    case "weekly":
      return handleWeekly(message);
    case "monthly":
      return handleMonthly(message);
    case "quests":
    case "quest":
    case "dailyquest":
    case "missions":
    case "daily-quests":
    case "dailyquests": {
      const { handleDailyQuest } = require("./commands/life/dailyQuest");
      return handleDailyQuest(message, args);
    }
    case "vote": {
      const { handleVote } = require("./commands/economy/vote");
      return handleVote(message, args);
    }
    case "stock":
    case "stocks":
    case "stock-market":
    case "stockmarket": {
      const { handleStock } = require("./commands/economy/stock");
      return handleStock(message, args);
    }
    case "my-stocks":
    case "mystocks":
    case "my-stock":
    case "mystock":
    case "stock-portfolio": {
      const { handleMyStocks } = require("./commands/economy/myStocks");
      return handleMyStocks(message);
    }
    case "rob":
    case "steal":
      return handleRob(message, args);
    case "shop":
    case "store":
      return handleShop(message, args);
    case "buy":
      return handleShop(message, ["buy", ...args]);
    case "inventory":
    case "inv":
    case "bag":
    case "items":
      return handleInventory(message, args);
    case "profile":
      return handleProfile(message, args);
    case "leaderboard":
      return handleLeaderboard(message, args);
    case "lb-wallet":
      return handleLeaderboard(message, ["cash"]);
    case "roulette-guide":
    case "roul-guide":
    case "rouletteguide":
    case "roulguide":
      return handleRouletteMenu(message);
    case "bet":
      return handleBet(message, args);
    case "blackjack":
      return handleBlackjack(message, args);
    case "rr":
    case "russianroulette":
    case "russian-roulette":
      return handleRussianRoulette(message, args);
    case "coinflip":
      return handleCoinflip(message, args);
    case "slots":
    case "slot":
      return handleSlots(message, args);
    case "cockfight":
    case "cock-fight":
      return handleCockFight(message, args);
    case "chicken":
    case "cock": {
      const { handleChicken } = require("./commands/games/chicken");
      return handleChicken(message, args);
    }
    case "feed": {
      const { handleFeed } = require("./commands/games/feed");
      return handleFeed(message, args);
    }
    case "hunt":
      return handleHunt(message, args);
    case "zoo":
    case "myzoo":
    case "my-zoo":
      return handleZoo(message, args);
    case "add-money":
    case "admin-add":
      return handleAddMoney(message, args);
    case "set-money":
      return handleSetMoney(message, args);
    case "remove-money":
    case "take-money":
      return handleRemoveMoney(message, args);
    case "reset-economy":
      return handleResetEconomy(message, args);
    case "global-announcement-preview":
    case "fortuna-global-preview":
      return handleGlobalAnnouncementPreview(message);
    case "global-announcement-send":
    case "fortuna-global-send":
      return handleGlobalAnnouncementSend(message);
    case "bm":
    case "market":
    case "black-market":
    case "blackmarket":
      return handleMarket(message, args);
    case "uni":
    case "university":
    case "education":
    case "edu":
    case "school": {
      const { handleEducation } = require("./commands/life/education");
      return handleEducation(message, args);
    }
    case "credit":
    case "score": {
      const { handleCredit } = require("./commands/economy/credit");
      return handleCredit(message, args);
    }
    case "set-credit-score": {
      const { handleSetCreditScore } = require("./commands/admin/manageCreditScore");
      return handleSetCreditScore(message, args);
    }
    case "ask":
    case "ask-money":
    case "askmoney": {
      const { handleAsk } = require("./commands/economy/ask");
      return handleAsk(message, args);
    }
    case "testwelcome": {
      const { handleTestWelcome } = require("./commands/admin/testwelcome");
      return handleTestWelcome(message);
    }
    case "use":
      return handleUse(message, args);
    case "iteminfo":
    case "item-info":
    case "item":
      return handleItemInfo(message, args);
    case "equip": {
      const { handleEquip } = require("./commands/economy/equip");
      return handleEquip(message, args);
    }
    case "cockstore":
    case "cock-store":
    case "cs": {
      const { handleShop } = require("./commands/economy/shop");
      return handleShop(message, ["cock"]);
    }
    case "degrees":
    case "mydegrees":
    case "degree": {
      const { handleListDegrees } = require("./commands/life/education");
      return handleListDegrees(message);
    }
    case "jobs":
    case "careers":
    case "joblist": {
      const { handleJobs } = require("./commands/life/jobs");
      return handleJobs(message);
    }
    case "apply": {
      const { handleApply } = require("./commands/life/apply");
      return handleApply(message, args);
    }
    case "relax":
    case "chill": {
      const { handleRelax } = require("./commands/life/relax");
      return handleRelax(message);
    }
    case "jobstore":
    case "job-store":
    case "workstore":
    case "work-store":
    case "jobshop":
    case "job-shop":
      return message.reply(STORE_MOVED_MESSAGE);
    case "work":
    case "job":
    case "myjob": {
      const { handleWork } = require("./commands/life/work");
      return handleWork(message);
    }
    case "career":
    case "mycareer": {
      const { handleCareer } = require("./commands/life/career");
      return handleCareer(message);
    }
    case "study": {
      const { handleStudy } = require("./commands/life/study");
      return handleStudy(message, args);
    }
    case "enroll": {
      const { handleEnroll } = require("./commands/life/enroll");
      return handleEnroll(message, args);
    }
    case "exam":
    case "finals": {
      const { handleExam } = require("./commands/life/enroll");
      return handleExam(message);
    }
    case "dropout": {
      const { handleDropout } = require("./commands/life/dropout");
      return handleDropout(message);
    }
    case "unistore":
    case "uni-store":
    case "bookstore":
    case "book-store":
      return message.reply(STORE_MOVED_MESSAGE);
    case "marry":
    case "propose": {
      const { handleMarry } = require("./commands/life/marriage");
      return handleMarry(message, args);
    }
    case "divorce": {
      const { handleDivorce } = require("./commands/life/marriage");
      return handleDivorce(message);
    }
    case "family":
    case "spouse":
    case "marriage": {
      const { handleFamily } = require("./commands/life/marriage");
      return handleFamily(message, args);
    }
    case "properties":
    case "realestate":
    case "estate":
      return propertiesHandler(message, args);
    case "buy-property":
    case "buyproperty":
    case "buyprop":
      return buyPropertyHandler(message, args);
    case "sell-property":
    case "sellproperty":
    case "sellprop":
      return sellPropertyHandler(message, args);
    case "my-properties":
    case "myproperties":
    case "myprops":
    case "portfolio":
      return myPropertiesHandler(message);
    case "collect-rent":
    case "collectrent":
    case "rent":
      return collectRentHandler(message);
    case "manage-uni":
    case "manageuni":
    case "uni-admin":
    case "uniadmin":
    case "manage-jobstore":
    case "managejobstore":
    case "job-admin":
    case "jobadmin":
      return message.reply(STORE_MOVED_MESSAGE);
    case "setint":
    case "set-int":
    case "setintelligence": {
      const { handleSetInt } = require("./commands/admin/educationAdmin");
      return handleSetInt(message, args);
    }
    case "setdis":
    case "set-dis":
    case "setdiscipline": {
      const { handleSetDis } = require("./commands/admin/educationAdmin");
      return handleSetDis(message, args);
    }
    case "resetedu":
    case "reset-edu": {
      const { handleResetEdu } = require("./commands/admin/educationAdmin");
      return handleResetEdu(message, args);
    }
    case "grantdegree":
    case "grant-degree": {
      const { handleGrantDegree } = require("./commands/admin/educationAdmin");
      return handleGrantDegree(message, args);
    }
    default: {
      const validCommands = [
        "balance", "bank", "card", "mycards", "deposit", "withdraw", "transfer",
        "work", "crime", "beg", "slut", "rob", "shop", "inventory", "profile",
        "leaderboard", "bet", "blackjack", "coinflip", "slots", "cockfight",
        "credit", "ask", "ask-money", "set-prefix", "help", "guide", "jobs", "education", "relax"
      ];

      const thinkUrl = getEmoteUrl(Mascot.Emotes.Think);
      const bestMatch = findBestMatch(normalized, validCommands);

      if (bestMatch) {
        const embed = errorEmbed(message.author, "Unknown Command", `Did you mean \`${prefix}${bestMatch}\`?`);
        if (thinkUrl) embed.setThumbnail(thinkUrl);
        return message.reply({ embeds: [embed] });
      }

      const embed = errorEmbed(
        message.author,
        "Unknown Command",
        `Command not found. Try: \`${prefix}bal\`, \`${prefix}bank\`, \`${prefix}profile\`, \`${prefix}help\`.`
      );
      if (thinkUrl) embed.setThumbnail(thinkUrl);
      return message.reply({ embeds: [embed] });
    }
  }
}
