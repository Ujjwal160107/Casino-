import { Client, Message } from "discord.js";
import { handleHelp } from "./commands/general/help";
import { handleSetPrefix } from "./commands/admin/setPrefix";
import { handleSetIncome } from "./commands/admin/setIncome";
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
import { handleProfile } from "./commands/economy/profile";
import { handleLeaderboard } from "./commands/economy/leaderboard";
import { execute as handleBank } from "./commands/economy/bank";
import { execute as handleMarket } from "./commands/economy/market";
import { handleBankInteraction } from "./handlers/bankInteractionHandler";
import { handleMarketInteraction } from "./handlers/marketInteractionHandler";
import { handleAddMoney } from "./commands/admin/addMoney";
import { handleSetEconomyConfig } from "./commands/admin/setEconomyConfig";
import { handleSetRoleIncome } from "./commands/admin/setRoleIncome";
import { handleRemoveMoney } from "./commands/admin/removeMoney";
import { handleCollectRoleIncome } from "./commands/economy/collect";
import { handleSetStartMoney } from "./commands/admin/setStartMoney";
import { handleSetIncomeCooldown } from "./commands/admin/setIncomeCooldown";
import { handleResetEconomy } from "./commands/admin/resetEconomy";
import { handleSetCurrency } from "./commands/admin/setCurrency";
import { handleSetCurrencyEmoji } from "./commands/admin/setCurrencyEmoji";
import { handleAdminViewConfig } from "./commands/admin/viewConfig";
import { handleAddShopItem } from "./commands/admin/addShopItem";
import { handleManageShop } from "./commands/admin/manageShop";
import { handleSetTheme } from "./commands/general/setTheme";
import { handleCasinoBan } from "./commands/admin/casinoBan";
import { handleCasinoUnban } from "./commands/admin/casinoUnban";
import { handleCasinoBanList } from "./commands/admin/casinoBanList";
import { handleSetGameCooldown } from "./commands/admin/setGameCooldown";
import { handleSetLogChannel } from "./commands/admin/setLogChannel";
import { handleBet } from "./commands/games/roulette";
import { handleBlackjack } from "./commands/games/blackjack";
import { handleCoinflip } from "./commands/games/coinflip";
import { handleSlots } from "./commands/games/slots";
import { handleCockFight } from "./commands/games/cockfight";
import { handleSetMinBet } from "./commands/admin/setMinBet";
import { handleAdminDashboard } from "./commands/admin/adminDashboard";
import { handleResetAdminSettings } from "./commands/admin/resetAdminConfig";
import prisma from "./utils/prisma";
import { errorEmbed } from "./utils/embed";
import { findBestMatch } from "./utils/stringUtils";
import { handleUse } from "./commands/economy/use";
import { handleItemInfo } from "./commands/economy/iteminfo";
import { Mascot, getEmoteUrl } from "./config/branding";

export async function routeMessage(client: Client, message: Message, prefix: string) {
  const raw = message.content.slice(1).trim();
  const [cmd, ...args] = raw.split(/\s+/);
  let command = cmd.toLowerCase();
  if (command === "set" && args[0]?.toLowerCase() === "casino" && args[1]?.toLowerCase() === "channel") {
    command = "set-casino-channel";
    args.splice(0, 2);
  }
  if (command === "channel" && args[0]?.toLowerCase() === "override") {
    command = "channel-override";
    args.shift();
  }
  if (command === "bot" && args[0]?.toLowerCase() === "commander") {
    command = "bot-commander";
    args.shift();
  }
  if (command === "command" && args[0]?.toLowerCase() === "status") {
    command = "command-status";
    args.shift();
  }
  if (message.author.id && message.guildId) {
    const user = await prisma.user.findUnique({
      where: { discordId_guildId: { discordId: message.author.id, guildId: message.guildId } }
    });
    if (user?.isBanned) {
      return message.reply({
        embeds: [errorEmbed(message.author, "Banned", "🚫 You are banned from the casino.")]
      });
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
      adminadd: "add-money",
      remove: "remove-money",
      take: "remove-money",
      "setstart": "set-start-money",
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
    const { checkCommandPermission } = require("./services/permissionService");
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
  switch (normalized) {
    case "addemoji":
      return handleAddEmoji(message, args);
    case "help":
      return handleHelp(message);
    case "setincome":
      return handleSetIncome(message, args);
    case "setprefix":
      return handleSetPrefix(message, args);
    case "setrob":
    case "set-rob":
      await handleSetRobConfig(message, args);
      break;
    case "setcurrencyemoji":
    case "setemoji":
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
    case "work":
    case "crime":
    case "beg":
    case "slut":
      return handleIncome(message);
    case "rob":
    case "steal":
      return handleRob(message, args);
    case "shop":
    case "store":
      return handleShop(message, args);
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
    case "bet":
      return handleBet(message, args);
    case "blackjack":
      return handleBlackjack(message, args);
    case "coinflip":
      return handleCoinflip(message, args);


    case "slots":
      return handleSlots(message, args);
    case "cockfight":
      return handleCockFight(message, args);
    case "chicken":
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
    case "setchicken":
      const { handleManageChicken } = require("./commands/admin/manageChicken");
      return handleManageChicken(message, args);
    case "add-money":
    case "admin-add":
      return handleAddMoney(message, args);
    case "remove-money":
    case "remove":
    case "take-money":
      return handleRemoveMoney(message, args);
    case "set-start-money":
    case "set-start":
      return handleSetStartMoney(message, args);
    case "set-income-cooldown":
    case "set-income-cd":
      return handleSetIncomeCooldown(message, args);
    case "set-global-game-cooldown":
    case "set-global-cd":
      const { handleSetGlobalGameCooldown } = require("./commands/admin/setGlobalGameCooldown");
      return handleSetGlobalGameCooldown(message, args);
    case "set-game-cooldown":
    case "set-game-cd":
    case "game-cd":
      return handleSetGameCooldown(message, args);
    case "reset-economy":
      return handleResetEconomy(message, args);
    case "set-currency":
      return handleSetCurrency(message, args);
    case "min-bet":
      return handleSetMinBet(message, args);
    case "admin-view-config":
    case "view-config":
      return handleAdminViewConfig(message, args);
    case "shop-add":
    case "add-shop-item":
      return handleAddShopItem(message, args);
    case "manage-item":
    case "edit-item":
    case "del-item":
    case "edit-shop":
    case "delete-shop":
      return handleManageShop(message, args);
    case "set-theme":
      return handleSetTheme(message, args);
    case "casino-ban":
    case "ban-user":
      return handleCasinoBan(message, args);
    case "casino-unban":
    case "unban-user":
      return handleCasinoUnban(message, args);
    case "casino-ban-list":
    case "ban-list":
      return handleCasinoBanList(message, args);
    case "bm":
    case "black-market":
      return handleMarket(message, args);
    case "set-loan-interest":
    case "set-loan":
      return handleSetEconomyConfig(message, args, "loan");
    case "set-bank-limit":
      return handleSetEconomyConfig(message, args, "bank-limit");
    case "set-wallet-limit":
      return handleSetEconomyConfig(message, args, "wallet-limit");
    case "uni":
    case "university":
      {
        const { handleEducation } = require("./commands/life/education");
        return handleEducation(message, args);
      }
    case "set-fd-interest":
    case "set-fd":
      return handleSetEconomyConfig(message, args, "fd");
    case "set-rd-interest":
    case "set-rd":
      return handleSetEconomyConfig(message, args, "rd");
    case "set-tax":
    case "market-tax":
      return handleSetEconomyConfig(message, args, "tax");
    case "set-credit-reward":
    case "set-reward":
      return handleSetEconomyConfig(message, args, "credit-reward");
    case "set-credit-penalty":
    case "set-penalty":
      return handleSetEconomyConfig(message, args, "credit-penalty");
    case "set-credit-cap":
    case "credit-cap":
      return handleSetEconomyConfig(message, args, "credit-cap");
    case "set-min-credit-cap":
    case "min-credit-cap":
      return handleSetEconomyConfig(message, args, "min-credit-cap");
    case "set-max-loans":
    case "max-loans":
      return handleSetEconomyConfig(message, args, "max-loans");
    case "credit":
    case "score":
      const { handleCredit } = require("./commands/economy/credit");
      return handleCredit(message, args);
    case "set-credit-score":
      const { handleSetCreditScore } = require("./commands/admin/manageCreditScore");
      return handleSetCreditScore(message, args);
    case "add-credit-tier":
      const { handleAddCreditTier } = require("./commands/admin/addCreditTier");
      return handleAddCreditTier(message, args);
    case "loan-ban":
    case "ban-loan":
      const { handleLoanBan } = require("./commands/admin/manageLoanBan");
      return handleLoanBan(message, args);
    case "loan-unban":
    case "unban-loan":
      const { handleLoanUnban } = require("./commands/admin/manageLoanBan");
      return handleLoanUnban(message, args);
    case "make-casino-admin":
    case "promote-casino-admin":
    case "casino-admin-add":
      const { handleMakeCasinoAdmin } = require("./commands/admin/manageCasinoAdmin");
      return handleMakeCasinoAdmin(message, args);
    case "remove-casino-admin":
    case "demote-casino-admin":
      const { handleRemoveCasinoAdmin } = require("./commands/admin/manageCasinoAdmin");
      return handleRemoveCasinoAdmin(message, args);
    case "casino-admins-list":
    case "casino-admins":
      const { handleListCasinoAdmins } = require("./commands/admin/manageCasinoAdmin");
      return handleListCasinoAdmins(message);
    case "config-credit-tier":
    case "config-credit":
    case "edit-credit-tier":
      const { handleConfigCreditTier } = require("./commands/admin/configCreditTier");
      return handleConfigCreditTier(message, args);
    case "view-credit-tiers":
    case "view-credit-config":
      const { handleViewCreditTiers } = require("./commands/admin/manageCreditConfig");
      return handleViewCreditTiers(message);
    case "delete-credit-tier":
    case "del-credit-tier":
      const { handleDeleteCreditTier } = require("./commands/admin/manageCreditConfig");
      return handleDeleteCreditTier(message, args);
    case "ask-money":
      const { handleAsk } = require("./commands/economy/ask");
      return handleAsk(message, args);
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
    case "reset-permissions":
    case "reset-perms":
    case "reset-access": {
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
    case "jobs": {
      const { handleJobs } = require("./commands/life/jobs");
      return handleJobs(message, args);
    }
    case "apply": {
      const { handleApply } = require("./commands/life/apply");
      return handleApply(message, args);
    }
    case "freelance": {
      const { handleFreelance } = require("./commands/life/freelance");
      return handleFreelance(message, args);
    }
    case "resign": {
      const { handleResign } = require("./commands/life/resign");
      return handleResign(message, args);
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

    // --- Education Admin ---
    case "setint":
    case "setintelligence": {
      const { handleSetInt } = require("./commands/admin/educationAdmin");
      return handleSetInt(message, args);
    }
    case "setdis":
    case "setdiscipline": {
      const { handleSetDis } = require("./commands/admin/educationAdmin");
      return handleSetDis(message, args);
    }
    case "resetedu": {
      const { handleResetEdu } = require("./commands/admin/educationAdmin");
      return handleResetEdu(message, args);
    }
    case "grantdegree": {
      const { handleGrantDegree } = require("./commands/admin/educationAdmin");
      return handleGrantDegree(message, args);
    }
    case "set-degree-cost":
    case "setdegree":
    case "settuition": {
      const { handleSetDegreeCost } = require("./commands/admin/educationAdmin");
      return handleSetDegreeCost(message, args);
    }
    case "set-study-cooldown":
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
        "min-bet", "viewconfig", "shop-add", "manage-item", "set-theme",
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