import { Client, Message } from "discord.js";
import { checkCommandPermission } from "./services/permissionService";
import { checkJailStatus } from "./services/jailService";
import { handleHelp } from "./commands/general/help";
import { handleCasinoGuide } from "./commands/general/casinoGuide";
import { handleTutorial } from "./commands/general/tutorial";
import { handleSetPrefix } from "./commands/admin/setPrefix";
import { handleSetIncome } from "./commands/admin/setIncome";
import { handleSetIncomeCooldown } from "./commands/admin/setIncomeCooldown";
import { handleAddEmoji } from "./commands/admin/addEmoji";
import { handleSetRobConfig } from "./commands/admin/setRob";
import { handleBalance } from "./commands/economy/balance";
import { handleDeposit } from "./commands/economy/deposit";
import { handleWithdrawBank } from "./commands/economy/withdrawBank";
import { handleTransfer } from "./commands/economy/transfer";
import { handleIncome } from "./commands/economy/incomeCommands";
import { handleRob } from "./commands/economy/rob";
import { handleShop } from "./commands/economy/shop";
import { handleInventory } from "./commands/economy/inventory";
import { propertiesHandler, buyPropertyHandler, sellPropertyHandler, myPropertiesHandler, collectRentHandler } from "./commands/economy/properties";
import { managePropertyHandler } from "./commands/admin/adminProperty";
import { handleProfile } from "./commands/economy/profile";
import { handleLeaderboard } from "./commands/economy/leaderboard";
import { execute as handleBank } from "./commands/economy/bank";
import { execute as handleMarket } from "./commands/economy/market";
import { handleDaily } from "./commands/economy/daily";
import { handleWeekly } from "./commands/economy/weekly";
import { handleMonthly } from "./commands/economy/monthly";
import { handleBankInteraction } from "./handlers/bankInteractionHandler";
import { handleMarketInteraction } from "./handlers/marketInteractionHandler";
import { handleAddMoney } from "./commands/admin/addMoney";
import { handleSetEconomyConfig } from "./commands/admin/setEconomyConfig";
import { handleSetRoleIncome } from "./commands/admin/setRoleIncome";
import { handleSetMoney } from "./commands/admin/setMoney";
import { handleRemoveMoney } from "./commands/admin/removeMoney";
import { handleCollectRoleIncome } from "./commands/economy/collect";
import { handleSetStartMoney } from "./commands/admin/setStartMoney";
// handleSetIncomeCooldown import moved up
import { handleResetEconomy } from "./commands/admin/resetEconomy";
import { handleSetCurrency } from "./commands/admin/setCurrency";
import { handleSetCurrencyEmoji } from "./commands/admin/setCurrencyEmoji";
import { handleAdminViewConfig } from "./commands/admin/viewConfig";
import { handleAddShopItem } from "./commands/admin/addShopItem";
import { handleManageShop } from "./commands/admin/manageShop";
// Removed handleSetTheme import
import { handleCasinoBan } from "./commands/admin/casinoBan";
import { handleCasinoUnban } from "./commands/admin/casinoUnban";
import { handleCasinoBanList } from "./commands/admin/casinoBanList";
import { handleSetGameCooldown } from "./commands/admin/setGameCooldown";
import { handleSetLogChannel } from "./commands/admin/setLogChannel";
import { handleChatMoneyConfig } from "./commands/admin/chatMoneyConfig";
import { handleBet, handleRouletteMenu } from "./commands/games/roulette";
import { handleBlackjack } from "./commands/games/blackjack";
import { handleCoinflip } from "./commands/games/coinflip";
import { handleRussianRoulette } from "./commands/games/russianRoulette";
import { handleSlots } from "./commands/games/slots";
import { handleCockFight } from "./commands/games/cockfight";
import { handleSetMinBet } from "./commands/admin/setMinBet";
import { handleAdminDashboard } from "./commands/admin/adminDashboard";
import { handleResetAdminSettings } from "./commands/admin/resetAdminConfig";
import { handleSetBetLimit } from "./commands/admin/betLimit";

import { handleSetup } from "./commands/admin/setup";
import { setupDrop } from "./commands/admin/setupDrop";
import { drop } from "./commands/admin/drop";
import prisma from "./utils/prisma";
import { errorEmbed } from "./utils/embed";
import { findBestMatch } from "./utils/stringUtils";
import { handleUse } from "./commands/economy/use";
import { handleItemInfo } from "./commands/economy/iteminfo";
import { Mascot, getEmoteUrl } from "./config/branding";
import { handleCrime } from "./commands/economy/crime";
import { handleJail, handleBail } from "./commands/economy/jail";

export async function routeMessage(client: Client, message: Message, prefix: string) {
  const raw = message.content.slice(1).trim();
  const [cmd, ...args] = raw.split(/\s+/);
  let command = cmd.toLowerCase();
  if (command === "set" && args[0]?.toLowerCase() === "casino" && args[1]?.toLowerCase() === "channel") {
    command = "set-casino-channel";
    args.splice(0, 2);
  }
  if ((command === "set" && args[0]?.toLowerCase() === "casinochannel") || command === "setcasinochannel") {
    command = "set-casino-channel";
    if (command !== "setcasinochannel") args.shift();
  }
  if (command === "set" && args[0]?.toLowerCase() === "prefix") {
    command = "setprefix";
    args.shift();
  }
  if (command === "channel" && args[0]?.toLowerCase() === "override") {
    command = "channel-override";
    args.shift();
  }
  if (command === "channeloverride") {
    command = "channel-override";
  }
  if (command === "bot" && args[0]?.toLowerCase() === "commander") {
    command = "bot-commander";
    args.shift();
  }
  if (command === "botcommander") {
    command = "bot-commander";
  }
  if (command === "command" && args[0]?.toLowerCase() === "status") {
    command = "command-status";
    args.shift();
  }
  if (command === "commandstatus") {
    command = "command-status";
  }
  // Hoist user variable for later use
  let user = null;
  if (message.author.id && message.guildId) {
    user = await prisma.user.findUnique({
      where: { discordId_guildId: { discordId: message.author.id, guildId: message.guildId } }
    });
    if (user?.isBanned) {
      if (user.banExpiresAt) {
        if (new Date() > user.banExpiresAt) {
          await prisma.user.update({
            where: { id: user.id },
            data: { isBanned: false, banExpiresAt: null }
          });
          user.isBanned = false; // Update local object
          user.banExpiresAt = null;
        } else {
          return message.reply({
            embeds: [errorEmbed(message.author, "Banned", `🚫 You are banned from the casino until <t:${Math.floor(user.banExpiresAt.getTime() / 1000)}:R>.`)]
          });
        }
      } else {
        return message.reply({
          embeds: [errorEmbed(message.author, "Banned", "🚫 You are permanently banned from the casino.")]
        });
      }
    }
  }
  const normalized = ((
    {
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
      "setstart": "set-start-money",
      "setstartmoney": "set-start-money",
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
      cockfight: "cockfight",
      cf: "cockfight",
      chicken: "chicken"
    } as Record<string, string>
  )[command] ?? command);
  if (message.guildId) {

    const { allowed, reason } = await checkCommandPermission(message, normalized);
    if (!allowed) {
      if (reason === "This channel is not a designated Casino Channel.") {
        return;
      }
      return message.reply({
        embeds: [errorEmbed(message.author, "Command Blocked", `🚫 ${reason || "You do not have permission to use this command."}`)]
      });
    }

  }

  // Check Jail Status for Economy Commands
  const RESTRICTED_IN_JAIL = [
    "work", "crime", "beg", "slut", "rob", "shop", "buy", "sell", "market",
    "bet", "blackjack", "roulette", "slots", "coinflip", "cockfight", "chicken",
    "withdraw", "deposit", "transfer", "give", "collect", "daily", "weekly", "monthly",
    "invest", "stock", "trade"
  ];

  if (RESTRICTED_IN_JAIL.includes(normalized) && user) {

    const { isJailed } = await checkJailStatus(user.id);
    if (isJailed) {
      return message.reply({
        embeds: [errorEmbed(message.author, "🔒 You are in Jail", `You cannot perform this action while incarcerated. Use \`${prefix}jail\` to check your status or \`${prefix}bail\` to pay your way out.`)]
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
    case "setincome":
    case "set-income":
      return handleSetIncome(message, args);
    case "setprefix":
    case "set-prefix":
      return handleSetPrefix(message, args);
    case "setrob":
    case "set-rob":
      await handleSetRobConfig(message, args);
      break;
    case "setcurrencyemoji":
    case "set-currency-emoji":
    case "setemoji":
    case "set-emoji":
      return handleSetCurrencyEmoji(message, args);
    case "balance":
      return handleBalance(message);
    case "bank":
      return handleBank(message, args);
    case "deposit":
      return handleDeposit(message, args);
    case "withdraw":
      return handleWithdrawBank(message, args);
    case "transfer":
    case "give":
      return handleTransfer(message, args);
    case "collect":
      return handleCollectRoleIncome(message, args);
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
    case "dailyquests":
      const { handleDailyQuest } = require("./commands/life/dailyQuest");
      return handleDailyQuest(message, args);

    case "stock":
    case "stocks":
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

    // ...

    case "apply": {
      const { handleApply } = require("./commands/life/apply");
      return handleApply(message, args);
    }
    case "work":
    case "job":
    case "myjob": {
      const { handleWork } = require("./commands/life/work");
      return handleWork(message);
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
      return handleInventory(message, args);
    case "profile":
    case "p":
    case "userinfo":
      return handleProfile(message, args);
    case "leaderboard":
      return handleLeaderboard(message, args);
    case "rank":
    case "level":
    case "lvl":
      const { rank } = require("./commands/general/rank");
      return rank(client, message, args);
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
    case "rr":
    case "russianroulette":
    case "russian-roulette":
      return handleRussianRoulette(message, args);
    case "coinflip":
    case "coinflip":
      return handleCoinflip(message, args);


    case "slots":
    case "slot":
      return handleSlots(message, args);
    case "cockfight":
    case "cock-fight":
      return handleCockFight(message, args);
    case "chicken":
    case "cock":
      const { handleChicken } = require("./commands/games/chicken");
      return handleChicken(message, args);
    case "feed":
      const { handleFeed } = require("./commands/games/feed");
      return handleFeed(message, args);
    case "set-cockfight":
    case "setcockfight":
      const { handleSetCockfight } = require("./commands/admin/setCockfight");
      return handleSetCockfight(message, args);
    case "set-chicken":
    case "manage-chicken":
    case "managechicken":
    case "setchicken":
    case "set-chicken": // Duplicate safe
      const { handleManageChicken } = require("./commands/admin/manageChicken");
      return handleManageChicken(message, args);
    case "add-money":
    case "addmoney":
    case "admin-add":
    case "adminadd":
      return handleAddMoney(message, args);
    case "set-money":
    case "setmoney":
      return handleSetMoney(message, args);
    case "remove-money":
    case "removemoney":
    case "remove":
    case "take-money":
    case "takemoney":
      return handleRemoveMoney(message, args);
    case "set-start-money":
    case "setstartmoney":
    case "set-start":
    case "setstart":
      return handleSetStartMoney(message, args);
    case "set-income-cooldown":
    case "setincomecooldown":
    case "set-income-cd":
    case "setincomecd":
      return handleSetIncomeCooldown(message, args);
    case "set-global-game-cooldown":
    case "setglobalgamecooldown":
    case "set-global-cd":
    case "setglobalcd":
      const { handleSetGlobalGameCooldown } = require("./commands/admin/setGlobalGameCooldown");
      return handleSetGlobalGameCooldown(message, args);
    case "set-game-cooldown":
    case "setgamecooldown":
    case "set-game-cd":
    case "setgamecd":
    case "game-cd":
    case "gamecd":
      return handleSetGameCooldown(message, args);
    case "reset-economy":
    case "reseteconomy":
      return handleResetEconomy(message, args);
    case "set-currency":
    case "setcurrency":
      return handleSetCurrency(message, args);
    case "min-bet":
    case "minbet":
      return handleSetMinBet(message, args);
    case "set-bet-limit":
    case "setbetlimit":
    case "betlimit":
    case "betlimits":
    case "bet-limit":
      return handleSetBetLimit(message, args);
    case "admin-view-config":
    case "adminviewconfig":
    case "view-config":
    case "viewconfig":
      return handleAdminViewConfig(message, args);
    case "shop-add":
    case "shopadd":
    case "add-shop-item":
    case "addshopitem":
      return handleAddShopItem(message, args);
    case "manage-item":
    case "manageitem":
    case "edit-item":
    case "edititem":
    case "del-item":
    case "delitem":
    case "edit-shop":
    case "editshop":
    case "delete-shop":
    case "deleteshop":
      return handleManageShop(message, args);
    case "remove-item":
    case "removeitem":
    case "del-item": // Duplicate, but safe in switch if grouped or distinct
    case "delete-item":
    case "deleteitem":
    case "remove-inv":
    case "removeinv":
    case "clear-inv":
    case "clearinv":
      const { handleRemoveItem } = require("./commands/admin/removeItem");
      return handleRemoveItem(message, args);
    case "reset-shop":
    case "resetshop":
    case "reset-store":
    case "resetstore":
      const { handleResetShop } = require("./commands/admin/resetShop");
      return handleResetShop(message, args);
    // Removed set-theme case
    case "casino-ban":
    case "casinoban":
    case "ban-user":
    case "banuser":
      return handleCasinoBan(message, args);
    case "casino-unban":
    case "casinounban":
    case "unban-user":
    case "unbanuser":
      return handleCasinoUnban(message, args);
    case "casino-ban-list":
    case "casinobanlist":
    case "ban-list":
    case "banlist":
      return handleCasinoBanList(message, args);
    case "bm":
    case "market":
    case "black-market":
    case "blackmarket":
      return handleMarket(message, args);
    case "set-loan-interest":
    case "setloaninterest":
    case "set-loan":
    case "setloan":
      return handleSetEconomyConfig(message, args, "loan");
    case "set-bank-limit":
    case "setbanklimit":
      return handleSetEconomyConfig(message, args, "bank-limit");
    case "set-wallet-limit":
    case "setwalletlimit":
      return handleSetEconomyConfig(message, args, "wallet-limit");
    case "set-daily":
    case "setdaily":
    case "set-daily-amount":
    case "setdailyamount":
      return handleSetEconomyConfig(message, args, "daily-amount");
    case "set-weekly":
    case "setweekly":
    case "set-weekly-amount":
    case "setweeklyamount":
      return handleSetEconomyConfig(message, args, "weekly-amount");
    case "set-monthly":
    case "setmonthly":
    case "set-monthly-amount":
    case "setmonthlyamount":
      return handleSetEconomyConfig(message, args, "monthly-amount");
    case "uni":
    case "university":
      {
        const { handleEducation } = require("./commands/life/education");
        return handleEducation(message, args);
      }
    case "set-fd-interest":
    case "setfdinterest":
    case "set-fd":
    case "setfd":
      return handleSetEconomyConfig(message, args, "fd");
    case "set-log-channel":
    case "setlogchannel":
    case "set-logs":
    case "setlogs":
    case "log-channel":
    case "logchannel":
      const { handleSetLogChannel } = require("./commands/admin/setLogChannel");
      return handleSetLogChannel(message, args);
    case "chatmoney":
    case "chat-money":
    case "cm":
      return handleChatMoneyConfig(message, args);
    case "set-casino-channel":
    case "setcasinochannel":
    case "casino-channel":
    case "casinochannel":
      const { handleSetCasinoChannel } = require("./commands/admin/setCasinoChannel");
      return handleSetCasinoChannel(message, args);
    case "set-rd-interest":
    case "setrdinterest":
    case "set-rd":
    case "setrd":
      return handleSetEconomyConfig(message, args, "rd");
    case "set-tax":
    case "settax":
    case "market-tax":
    case "markettax":
      return handleSetEconomyConfig(message, args, "tax");
    case "set-credit-reward":
    case "setcreditreward":
    case "set-reward":
    case "setreward":
      return handleSetEconomyConfig(message, args, "credit-reward");
    case "set-credit-penalty":
    case "setcreditpenalty":
    case "set-penalty":
    case "setpenalty":
      return handleSetEconomyConfig(message, args, "credit-penalty");
    case "set-credit-cap":
    case "setcreditcap":
    case "credit-cap":
    case "creditcap":
      return handleSetEconomyConfig(message, args, "credit-cap");
    case "set-min-credit-cap":
    case "setmincreditcap":
    case "min-credit-cap":
    case "mincreditcap":
      return handleSetEconomyConfig(message, args, "min-credit-cap");
    case "set-max-loans":
    case "setmaxloans":
    case "max-loans":
    case "maxloans":
      return handleSetEconomyConfig(message, args, "max-loans");
    case "credit":
    case "score":
      const { handleCredit } = require("./commands/economy/credit");
      return handleCredit(message, args);
    case "set-credit-score":
    case "setcreditscore":
      const { handleSetCreditScore } = require("./commands/admin/manageCreditScore");
      return handleSetCreditScore(message, args);
    case "add-credit-tier":
    case "addcredittier":
      const { handleAddCreditTier } = require("./commands/admin/addCreditTier");
      return handleAddCreditTier(message, args);
    case "loan-ban":
    case "loanban":
    case "ban-loan":
    case "banloan":
      const { handleLoanBan } = require("./commands/admin/manageLoanBan");
      return handleLoanBan(message, args);
    case "loan-unban":
    case "loanunban":
    case "unban-loan":
    case "unbanloan":
      const { handleLoanUnban } = require("./commands/admin/manageLoanBan");
      return handleLoanUnban(message, args);
    case "reset-loans":
    case "resetloans":
      const { handleResetLoans } = require("./commands/admin/resetLoans");
      return handleResetLoans(message, args);
    case "make-casino-admin":
    case "makecasinoadmin":
    case "promote-casino-admin":
    case "promotecasinoadmin":
    case "casino-admin-add":
    case "casinoadminadd":
      const { handleMakeCasinoAdmin } = require("./commands/admin/manageCasinoAdmin");
      return handleMakeCasinoAdmin(message, args);
    case "remove-casino-admin":
    case "removecasinoadmin":
    case "demote-casino-admin":
    case "demotecasinoadmin":
      const { handleRemoveCasinoAdmin } = require("./commands/admin/manageCasinoAdmin");
      return handleRemoveCasinoAdmin(message, args);
    case "casino-admins-list":
    case "casinoadminslist":
    case "casino-admins":
    case "casinoadmins":
      const { handleListCasinoAdmins } = require("./commands/admin/manageCasinoAdmin");
      return handleListCasinoAdmins(message);
    case "config-credit-tier":
    case "configcredittier":
    case "config-credit":
    case "configcredit":
    case "edit-credit-tier":
    case "editcredittier":
      const { handleConfigCreditTier } = require("./commands/admin/configCreditTier");
      return handleConfigCreditTier(message, args);
    case "config-jobs":
    case "configjobs":
    case "config-job":
    case "configjob":
    case "set-job-salary":
    case "setjobsalary":
      const { handleConfigJobs } = require("./commands/admin/configJobs");
      return handleConfigJobs(message, args);
    case "view-credit-tiers":
    case "viewcredittiers":
    case "view-credit-config":
    case "viewcreditconfig":
      const { handleViewCreditTiers } = require("./commands/admin/manageCreditConfig");
      return handleViewCreditTiers(message);
    case "delete-credit-tier":
    case "deletecredittier":
    case "del-credit-tier":
    case "delcredittier":
      const { handleDeleteCreditTier } = require("./commands/admin/manageCreditConfig");
      return handleDeleteCreditTier(message, args);
    case "ask-money":
    case "askmoney":
      const { handleAsk } = require("./commands/economy/ask");
      return handleAsk(message, args);

    case "setup":
    case "config": // Alias config to setup as it's the new master config
    case "admin-setup":
    case "adminsetup":
      return handleSetup(message, args);

    case "test": {
      const { handleCommandStatus } = require("./commands/admin/debugPermissions");
      return handleCommandStatus(message, args);
    }
    case "adminpanel":
    case "admin-panel":
    case "dashboard": {
      return handleAdminDashboard(message);
    }
    case "reset-admin-settings":
    case "resetadminsettings":
    case "reset-permissions":
    case "resetpermissions":
    case "reset-perms":
    case "resetperms":
    case "reset-access":
    case "resetaccess": {
      return handleResetAdminSettings(message);
    }
    case "use": {
      return handleUse(message, args);
    }
    case "iteminfo":
    case "item-info":
    case "item": {
      return handleItemInfo(message, args);
    }
    case "equip": {
      const { handleEquip } = require("./commands/economy/equip");
      return handleEquip(message, args);
    }
    case "cockstore":
    case "cock-store":
    case "cs": {
      const { handleCockStore } = require("./commands/shop/cockStore");
      return handleCockStore(message, args);
    }

    case "degrees":
    case "mydegrees":
    case "degree": {
      const { handleListDegrees } = require("./commands/life/education");
      return handleListDegrees(message);
    }
    case "jobs":
    case "careers":
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
    case "job-shop": {
      const { handleJobStore } = require("./commands/life/jobStore");
      return handleJobStore(message, args);
    }
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


    // EDUCATION
    case "education":
    case "edu":
    case "school": {
      const { handleEducation } = require("./commands/life/education");
      return handleEducation(message, args);
    }
    case "study": {
      const { handleStudy } = require("./commands/life/study");
      return handleStudy(message);
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
    case "book-store": {
      const { handleUniStore } = require("./commands/life/uniStore");
      return handleUniStore(message);
    }

    // MARRIAGE COMMANDS
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

    // PROPERTY COMMANDS
    case "properties":
    case "realestate":
    case "estate":
      return propertiesHandler(message, args);
    case "buy-property":
    case "buyproperty":
    case "buyprop":
      return buyPropertyHandler(message, args);
    case "sell-property": // System sell
    case "sellproperty":
    case "sellprop":
      return sellPropertyHandler(message, args);
    case "my-properties":
    case "myproperties":
    case "myprops":
    case "portfolio": // Overlap with stock portfolio? Maybe check args or context, for now alias is fine if stock uses "stock-portfolio"
      return myPropertiesHandler(message);
    case "collect-rent":
    case "collectrent":
    case "rent":
      return collectRentHandler(message);
    case "manage-property":
    case "manageproperty":
    case "property-admin":
    case "propertyadmin":
      return managePropertyHandler(message, args);
    case "manage-uni":
    case "manageuni":
    case "uni-admin":
    case "uniadmin": {
      const { handleManageUniStore } = require("./commands/admin/manageUniStore");
      return handleManageUniStore(message, args);
    }
    case "manage-jobstore":
    case "managejobstore":
    case "job-admin":
    case "jobadmin": {
      const { handleManageJobStore } = require("./commands/admin/manageJobStore");
      return handleManageJobStore(message, args);
    }

    // --- Casino Drops ---
    case "setup-drop":
    case "setupdrop":
    case "config-drop":
    case "drop-setup":
      return setupDrop(message, args);
    case "drop":
    case "manual-drop":
    case "spawn-drop":
      return drop(message, args);

    // --- Education Admin ---
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
    case "set-degree-cost":
    case "setdegreecost":
    case "setdegree":
    case "settuition": {
      const { handleSetDegreeCost } = require("./commands/admin/educationAdmin");
      return handleSetDegreeCost(message, args);
    }
    case "set-study-cooldown":
    case "setstudycooldown":
    case "set-study-cd":
    case "setstudycd": {
      const { handleSetStudyCooldown } = require("./commands/admin/educationAdmin");
      return handleSetStudyCooldown(message, args);
    }
    default:
      const VALID_COMMANDS = [
        "balance", "bank", "deposit", "withdraw", "transfer", "collect",
        "work", "crime", "beg", "slut", "rob", "shop", "inventory", "profile",
        "leaderboard", "rank", "bet", "blackjack", "coinflip", "slots",
        "add-money", "remove-money", "set-start-money", "reset-economy", "set-currency",
        "min-bet", "viewconfig", "shop-add", "manage-item",
        "casino-ban", "casino-unban", "banlist", "black-market",
        "set-loan-interest", "set-fd-interest", "set-rd-interest", "set-tax",
        "set-credit-reward", "set-credit-penalty", "set-credit-cap",
        "set-min-credit-cap", "set-max-loans", "credit", "set-credit",
        "add-credit-tier", "config-credit-tier", "view-credit-tiers", "delete-credit-tier",
        "add-credit-tier", "config-credit-tier", "view-credit-tiers", "delete-credit-tier",
        "ask-money", "config-rob", "add-emoji", "set-income-cd", "set-prefix",
        "set-currency-emoji", "adminpanel"
      ];
      const thinkUrl = getEmoteUrl(Mascot.Emotes.Think);
      const bestMatch = findBestMatch(command, VALID_COMMANDS);

      if (bestMatch) {
        const embed = errorEmbed(message.author, "Unknown Command", `Did you mean \`${prefix}${bestMatch}\`?`);
        if (thinkUrl) embed.setThumbnail(thinkUrl);
        return message.reply({ embeds: [embed] });
      }

      const embed = errorEmbed(message.author, "Unknown Command", `Command not found. Try: \`${prefix}bal\`, \`${prefix}shop\`, \`${prefix}inv\`, \`${prefix}help\`.`);
      if (thinkUrl) embed.setThumbnail(thinkUrl);
      return message.reply({ embeds: [embed] });
  }
}