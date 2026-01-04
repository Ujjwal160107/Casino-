"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeMessage = routeMessage;
const help_1 = require("./commands/general/help");
const casinoGuide_1 = require("./commands/general/casinoGuide");
const guide_1 = require("./commands/general/guide");
const setPrefix_1 = require("./commands/admin/setPrefix");
const setIncome_1 = require("./commands/admin/setIncome");
const setIncomeCooldown_1 = require("./commands/admin/setIncomeCooldown");
const addEmoji_1 = require("./commands/admin/addEmoji");
const setRob_1 = require("./commands/admin/setRob");
const balance_1 = require("./commands/economy/balance");
const deposit_1 = require("./commands/economy/deposit");
const withdrawBank_1 = require("./commands/economy/withdrawBank");
const transfer_1 = require("./commands/economy/transfer");
const incomeCommands_1 = require("./commands/economy/incomeCommands");
const rob_1 = require("./commands/economy/rob");
const shop_1 = require("./commands/economy/shop");
const inventory_1 = require("./commands/economy/inventory");
const properties_1 = require("./commands/economy/properties");
const adminProperty_1 = require("./commands/admin/adminProperty");
const profile_1 = require("./commands/economy/profile");
const leaderboard_1 = require("./commands/economy/leaderboard");
const bank_1 = require("./commands/economy/bank");
const market_1 = require("./commands/economy/market");
const daily_1 = require("./commands/economy/daily");
const weekly_1 = require("./commands/economy/weekly");
const monthly_1 = require("./commands/economy/monthly");
const addMoney_1 = require("./commands/admin/addMoney");
const setEconomyConfig_1 = require("./commands/admin/setEconomyConfig");
const setMoney_1 = require("./commands/admin/setMoney");
const removeMoney_1 = require("./commands/admin/removeMoney");
const collect_1 = require("./commands/economy/collect");
const setStartMoney_1 = require("./commands/admin/setStartMoney");
// handleSetIncomeCooldown import moved up
const resetEconomy_1 = require("./commands/admin/resetEconomy");
const setCurrency_1 = require("./commands/admin/setCurrency");
const setCurrencyEmoji_1 = require("./commands/admin/setCurrencyEmoji");
const viewConfig_1 = require("./commands/admin/viewConfig");
const addShopItem_1 = require("./commands/admin/addShopItem");
const manageShop_1 = require("./commands/admin/manageShop");
// Removed handleSetTheme import
const casinoBan_1 = require("./commands/admin/casinoBan");
const casinoUnban_1 = require("./commands/admin/casinoUnban");
const casinoBanList_1 = require("./commands/admin/casinoBanList");
const setGameCooldown_1 = require("./commands/admin/setGameCooldown");
const chatMoneyConfig_1 = require("./commands/admin/chatMoneyConfig");
const roulette_1 = require("./commands/games/roulette");
const blackjack_1 = require("./commands/games/blackjack");
const coinflip_1 = require("./commands/games/coinflip");
const russianRoulette_1 = require("./commands/games/russianRoulette");
const slots_1 = require("./commands/games/slots");
const cockfight_1 = require("./commands/games/cockfight");
const setMinBet_1 = require("./commands/admin/setMinBet");
const adminDashboard_1 = require("./commands/admin/adminDashboard");
const resetAdminConfig_1 = require("./commands/admin/resetAdminConfig");
const betLimit_1 = require("./commands/admin/betLimit");
const setup_1 = require("./commands/admin/setup");
const prisma_1 = __importDefault(require("./utils/prisma"));
const embed_1 = require("./utils/embed");
const stringUtils_1 = require("./utils/stringUtils");
const use_1 = require("./commands/economy/use");
const iteminfo_1 = require("./commands/economy/iteminfo");
const branding_1 = require("./config/branding");
const crime_1 = require("./commands/economy/crime");
const jail_1 = require("./commands/economy/jail");
async function routeMessage(client, message, prefix) {
    const raw = message.content.slice(1).trim();
    const [cmd, ...args] = raw.split(/\s+/);
    let command = cmd.toLowerCase();
    if (command === "set" && args[0]?.toLowerCase() === "casino" && args[1]?.toLowerCase() === "channel") {
        command = "set-casino-channel";
        args.splice(0, 2);
    }
    if ((command === "set" && args[0]?.toLowerCase() === "casinochannel") || command === "setcasinochannel") {
        command = "set-casino-channel";
        if (command !== "setcasinochannel")
            args.shift();
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
        user = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId: message.author.id, guildId: message.guildId } }
        });
        if (user?.isBanned) {
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Banned", "🚫 You are banned from the casino.")]
            });
        }
    }
    const normalized = ({
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
    }[command] ?? command);
    if (message.guildId) {
        const { checkCommandPermission } = require("./services/permissionService");
        const { allowed, reason } = await checkCommandPermission(message, normalized);
        if (!allowed) {
            if (reason === "This channel is not a designated Casino Channel.") {
                return;
            }
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "Command Blocked", `🚫 ${reason || "You do not have permission to use this command."}`)]
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
        const { checkJailStatus } = require("./services/jailService");
        const { isJailed } = await checkJailStatus(user.id);
        if (isJailed) {
            return message.reply({
                embeds: [(0, embed_1.errorEmbed)(message.author, "🔒 You are in Jail", "You cannot perform this action while incarcerated. Use `!jail` to check your status or `!bail` to pay your way out.")]
            });
        }
    }
    switch (normalized) {
        case "addemoji":
            return (0, addEmoji_1.handleAddEmoji)(message, args);
        case "help":
            return (0, help_1.handleHelp)(message);
        case "casino":
        case "games":
        case "casinoguide":
        case "casino-guide":
            return (0, casinoGuide_1.handleCasinoGuide)(message);
        case "guide":
            return (0, guide_1.handleGuide)(message);
        case "setincome":
        case "set-income":
            return (0, setIncome_1.handleSetIncome)(message, args);
        case "setprefix":
        case "set-prefix":
            return (0, setPrefix_1.handleSetPrefix)(message, args);
        case "setrob":
        case "set-rob":
            await (0, setRob_1.handleSetRobConfig)(message, args);
            break;
        case "setcurrencyemoji":
        case "set-currency-emoji":
        case "setemoji":
        case "set-emoji":
            return (0, setCurrencyEmoji_1.handleSetCurrencyEmoji)(message, args);
        case "balance":
            return (0, balance_1.handleBalance)(message);
        case "bank":
            return (0, bank_1.execute)(message, args);
        case "deposit":
            return (0, deposit_1.handleDeposit)(message, args);
        case "withdraw":
            return (0, withdrawBank_1.handleWithdrawBank)(message, args);
        case "transfer":
        case "give":
            return (0, transfer_1.handleTransfer)(message, args);
        case "collect":
            return (0, collect_1.handleCollectRoleIncome)(message, args);
        case "crime":
            return (0, crime_1.handleCrime)(message);
        case "beg":
        case "slut":
            return (0, incomeCommands_1.handleIncome)(message);
        case "jail":
        case "status":
            return (0, jail_1.handleJail)(message);
        case "bail":
        case "release":
        case "paybail":
        case "pay-bail":
            return (0, jail_1.handleBail)(message);
        case "daily":
            return (0, daily_1.handleDaily)(message);
        case "weekly":
            return (0, weekly_1.handleWeekly)(message);
        case "monthly":
            return (0, monthly_1.handleMonthly)(message);
        case "quests":
        case "dailyquest":
        case "missions":
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
            return (0, rob_1.handleRob)(message, args);
        case "shop":
        case "store":
            return (0, shop_1.handleShop)(message, args);
        case "buy":
            return (0, shop_1.handleShop)(message, ["buy", ...args]);
        case "inventory":
            return (0, inventory_1.handleInventory)(message, args);
        case "profile":
        case "p":
        case "userinfo":
            return (0, profile_1.handleProfile)(message, args);
        case "leaderboard":
            return (0, leaderboard_1.handleLeaderboard)(message, args);
        case "rank":
        case "level":
        case "lvl":
            const { rank } = require("./commands/general/rank");
            return rank(client, message, args);
        case "lb-wallet":
            return (0, leaderboard_1.handleLeaderboard)(message, ["cash"]);
        case "roulette-guide":
        case "roul-guide":
        case "rouletteguide":
        case "roulguide":
            return (0, roulette_1.handleRouletteMenu)(message);
        case "bet":
            return (0, roulette_1.handleBet)(message, args);
        case "blackjack":
            return (0, blackjack_1.handleBlackjack)(message, args);
        case "rr":
        case "rr":
        case "russianroulette":
        case "russian-roulette":
            return (0, russianRoulette_1.handleRussianRoulette)(message, args);
        case "coinflip":
        case "coin-flip":
            return (0, coinflip_1.handleCoinflip)(message, args);
        case "slots":
            return (0, slots_1.handleSlots)(message, args);
        case "cockfight":
        case "cock-fight":
            return (0, cockfight_1.handleCockFight)(message, args);
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
        case "managechicken":
        case "setchicken":
        case "set-chicken": // Duplicate safe
            const { handleManageChicken } = require("./commands/admin/manageChicken");
            return handleManageChicken(message, args);
        case "add-money":
        case "addmoney":
        case "admin-add":
        case "adminadd":
            return (0, addMoney_1.handleAddMoney)(message, args);
        case "set-money":
        case "setmoney":
            return (0, setMoney_1.handleSetMoney)(message, args);
        case "remove-money":
        case "removemoney":
        case "remove":
        case "take-money":
        case "takemoney":
            return (0, removeMoney_1.handleRemoveMoney)(message, args);
        case "set-start-money":
        case "setstartmoney":
        case "set-start":
        case "setstart":
            return (0, setStartMoney_1.handleSetStartMoney)(message, args);
        case "set-income-cooldown":
        case "setincomecooldown":
        case "set-income-cd":
        case "setincomecd":
            return (0, setIncomeCooldown_1.handleSetIncomeCooldown)(message, args);
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
            return (0, setGameCooldown_1.handleSetGameCooldown)(message, args);
        case "reset-economy":
        case "reseteconomy":
            return (0, resetEconomy_1.handleResetEconomy)(message, args);
        case "set-currency":
        case "setcurrency":
            return (0, setCurrency_1.handleSetCurrency)(message, args);
        case "min-bet":
        case "minbet":
            return (0, setMinBet_1.handleSetMinBet)(message, args);
        case "set-bet-limit":
        case "setbetlimit":
        case "betlimit":
        case "bet-limit":
            return (0, betLimit_1.handleSetBetLimit)(message, args);
        case "admin-view-config":
        case "adminviewconfig":
        case "view-config":
        case "viewconfig":
            return (0, viewConfig_1.handleAdminViewConfig)(message, args);
        case "shop-add":
        case "shopadd":
        case "add-shop-item":
        case "addshopitem":
            return (0, addShopItem_1.handleAddShopItem)(message, args);
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
            return (0, manageShop_1.handleManageShop)(message, args);
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
            return (0, casinoBan_1.handleCasinoBan)(message, args);
        case "casino-unban":
        case "casinounban":
        case "unban-user":
        case "unbanuser":
            return (0, casinoUnban_1.handleCasinoUnban)(message, args);
        case "casino-ban-list":
        case "casinobanlist":
        case "ban-list":
        case "banlist":
            return (0, casinoBanList_1.handleCasinoBanList)(message, args);
        case "bm":
        case "market":
        case "black-market":
        case "blackmarket":
            return (0, market_1.execute)(message, args);
        case "set-loan-interest":
        case "setloaninterest":
        case "set-loan":
        case "setloan":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "loan");
        case "set-bank-limit":
        case "setbanklimit":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "bank-limit");
        case "set-wallet-limit":
        case "setwalletlimit":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "wallet-limit");
        case "set-daily":
        case "setdaily":
        case "set-daily-amount":
        case "setdailyamount":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "daily-amount");
        case "set-weekly":
        case "setweekly":
        case "set-weekly-amount":
        case "setweeklyamount":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "weekly-amount");
        case "set-monthly":
        case "setmonthly":
        case "set-monthly-amount":
        case "setmonthlyamount":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "monthly-amount");
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
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "fd");
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
            return (0, chatMoneyConfig_1.handleChatMoneyConfig)(message, args);
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
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "rd");
        case "set-tax":
        case "settax":
        case "market-tax":
        case "markettax":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "tax");
        case "set-credit-reward":
        case "setcreditreward":
        case "set-reward":
        case "setreward":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "credit-reward");
        case "set-credit-penalty":
        case "setcreditpenalty":
        case "set-penalty":
        case "setpenalty":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "credit-penalty");
        case "set-credit-cap":
        case "setcreditcap":
        case "credit-cap":
        case "creditcap":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "credit-cap");
        case "set-min-credit-cap":
        case "setmincreditcap":
        case "min-credit-cap":
        case "mincreditcap":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "min-credit-cap");
        case "set-max-loans":
        case "setmaxloans":
        case "max-loans":
        case "maxloans":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "max-loans");
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
            return (0, setup_1.handleSetup)(message, args);
        case "test": {
            const { handleCommandStatus } = require("./commands/admin/debugPermissions");
            return handleCommandStatus(message, args);
        }
        case "adminpanel":
        case "admin-panel":
        case "dashboard": {
            return (0, adminDashboard_1.handleAdminDashboard)(message);
        }
        case "reset-admin-settings":
        case "resetadminsettings":
        case "reset-permissions":
        case "resetpermissions":
        case "reset-perms":
        case "resetperms":
        case "reset-access":
        case "resetaccess": {
            return (0, resetAdminConfig_1.handleResetAdminSettings)(message);
        }
        case "use": {
            return (0, use_1.handleUse)(message, args);
        }
        case "iteminfo":
        case "item-info":
        case "item": {
            return (0, iteminfo_1.handleItemInfo)(message, args);
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
            return (0, properties_1.propertiesHandler)(message, args);
        case "buy-property":
        case "buyproperty":
        case "buyprop":
            return (0, properties_1.buyPropertyHandler)(message, args);
        case "sell-property": // System sell
        case "sellproperty":
        case "sellprop":
            return (0, properties_1.sellPropertyHandler)(message, args);
        case "my-properties":
        case "myproperties":
        case "myprops":
        case "portfolio": // Overlap with stock portfolio? Maybe check args or context, for now alias is fine if stock uses "stock-portfolio"
            return (0, properties_1.myPropertiesHandler)(message);
        case "collect-rent":
        case "collectrent":
        case "rent":
            return (0, properties_1.collectRentHandler)(message);
        case "manage-property":
        case "manageproperty":
        case "property-admin":
        case "propertyadmin":
            return (0, adminProperty_1.managePropertyHandler)(message, args);
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
            const thinkUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Think);
            const bestMatch = (0, stringUtils_1.findBestMatch)(command, VALID_COMMANDS);
            if (bestMatch) {
                const embed = (0, embed_1.errorEmbed)(message.author, "Unknown Command", `Did you mean \`${prefix}${bestMatch}\`?`);
                if (thinkUrl)
                    embed.setThumbnail(thinkUrl);
                return message.reply({ embeds: [embed] });
            }
            const embed = (0, embed_1.errorEmbed)(message.author, "Unknown Command", `Command not found. Try: \`${prefix}bal\`, \`${prefix}shop\`, \`${prefix}inv\`, \`${prefix}help\`.`);
            if (thinkUrl)
                embed.setThumbnail(thinkUrl);
            return message.reply({ embeds: [embed] });
    }
}
//# sourceMappingURL=commandRouter.js.map