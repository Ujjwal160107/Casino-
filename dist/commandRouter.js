"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.routeMessage = routeMessage;
const help_1 = require("./commands/general/help");
const setPrefix_1 = require("./commands/admin/setPrefix");
const setIncome_1 = require("./commands/admin/setIncome");
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
const profile_1 = require("./commands/economy/profile");
const leaderboard_1 = require("./commands/economy/leaderboard");
const bank_1 = require("./commands/economy/bank");
const market_1 = require("./commands/economy/market");
const addMoney_1 = require("./commands/admin/addMoney");
const setEconomyConfig_1 = require("./commands/admin/setEconomyConfig");
const removeMoney_1 = require("./commands/admin/removeMoney");
const collect_1 = require("./commands/economy/collect");
const setStartMoney_1 = require("./commands/admin/setStartMoney");
const setIncomeCooldown_1 = require("./commands/admin/setIncomeCooldown");
const resetEconomy_1 = require("./commands/admin/resetEconomy");
const setCurrency_1 = require("./commands/admin/setCurrency");
const setCurrencyEmoji_1 = require("./commands/admin/setCurrencyEmoji");
const viewConfig_1 = require("./commands/admin/viewConfig");
const addShopItem_1 = require("./commands/admin/addShopItem");
const manageShop_1 = require("./commands/admin/manageShop");
const setTheme_1 = require("./commands/general/setTheme");
const casinoBan_1 = require("./commands/admin/casinoBan");
const casinoUnban_1 = require("./commands/admin/casinoUnban");
const casinoBanList_1 = require("./commands/admin/casinoBanList");
const setGameCooldown_1 = require("./commands/admin/setGameCooldown");
const roulette_1 = require("./commands/games/roulette");
const blackjack_1 = require("./commands/games/blackjack");
const coinflip_1 = require("./commands/games/coinflip");
const slots_1 = require("./commands/games/slots");
const cockfight_1 = require("./commands/games/cockfight");
const setMinBet_1 = require("./commands/admin/setMinBet");
const adminDashboard_1 = require("./commands/admin/adminDashboard");
const resetAdminConfig_1 = require("./commands/admin/resetAdminConfig");
const betLimit_1 = require("./commands/admin/betLimit");
const prisma_1 = __importDefault(require("./utils/prisma"));
const embed_1 = require("./utils/embed");
const stringUtils_1 = require("./utils/stringUtils");
const use_1 = require("./commands/economy/use");
const iteminfo_1 = require("./commands/economy/iteminfo");
const branding_1 = require("./config/branding");
async function routeMessage(client, message, prefix) {
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
        const user = await prisma_1.default.user.findUnique({
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
    switch (normalized) {
        case "addemoji":
            return (0, addEmoji_1.handleAddEmoji)(message, args);
        case "help":
            return (0, help_1.handleHelp)(message);
        case "setincome":
            return (0, setIncome_1.handleSetIncome)(message, args);
        case "setprefix":
            return (0, setPrefix_1.handleSetPrefix)(message, args);
        case "setrob":
        case "set-rob":
            await (0, setRob_1.handleSetRobConfig)(message, args);
            break;
        case "setcurrencyemoji":
        case "setemoji":
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
        case "work":
        case "crime":
        case "beg":
        case "slut":
            return (0, incomeCommands_1.handleIncome)(message);
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
        case "bet":
            return (0, roulette_1.handleBet)(message, args);
        case "blackjack":
            return (0, blackjack_1.handleBlackjack)(message, args);
        case "coinflip":
            return (0, coinflip_1.handleCoinflip)(message, args);
        case "slots":
            return (0, slots_1.handleSlots)(message, args);
        case "cockfight":
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
        case "setchicken":
            const { handleManageChicken } = require("./commands/admin/manageChicken");
            return handleManageChicken(message, args);
        case "add-money":
        case "admin-add":
            return (0, addMoney_1.handleAddMoney)(message, args);
        case "remove-money":
        case "remove":
        case "take-money":
            return (0, removeMoney_1.handleRemoveMoney)(message, args);
        case "set-start-money":
        case "set-start":
            return (0, setStartMoney_1.handleSetStartMoney)(message, args);
        case "set-income-cooldown":
        case "set-income-cd":
            return (0, setIncomeCooldown_1.handleSetIncomeCooldown)(message, args);
        case "set-global-game-cooldown":
        case "set-global-cd":
            const { handleSetGlobalGameCooldown } = require("./commands/admin/setGlobalGameCooldown");
            return handleSetGlobalGameCooldown(message, args);
        case "set-game-cooldown":
        case "set-game-cd":
        case "game-cd":
            return (0, setGameCooldown_1.handleSetGameCooldown)(message, args);
        case "reset-economy":
            return (0, resetEconomy_1.handleResetEconomy)(message, args);
        case "set-currency":
            return (0, setCurrency_1.handleSetCurrency)(message, args);
        case "min-bet":
            return (0, setMinBet_1.handleSetMinBet)(message, args);
        case "set-bet-limit":
        case "setbetlimit":
        case "betlimit":
        case "bet-limit":
            return (0, betLimit_1.handleSetBetLimit)(message, args);
        case "admin-view-config":
        case "view-config":
            return (0, viewConfig_1.handleAdminViewConfig)(message, args);
        case "shop-add":
        case "add-shop-item":
            return (0, addShopItem_1.handleAddShopItem)(message, args);
        case "manage-item":
        case "edit-item":
        case "del-item":
        case "edit-shop":
        case "delete-shop":
            return (0, manageShop_1.handleManageShop)(message, args);
        case "set-theme":
            return (0, setTheme_1.handleSetTheme)(message, args);
        case "casino-ban":
        case "ban-user":
            return (0, casinoBan_1.handleCasinoBan)(message, args);
        case "casino-unban":
        case "unban-user":
            return (0, casinoUnban_1.handleCasinoUnban)(message, args);
        case "casino-ban-list":
        case "ban-list":
            return (0, casinoBanList_1.handleCasinoBanList)(message, args);
        case "bm":
        case "black-market":
            return (0, market_1.execute)(message, args);
        case "set-loan-interest":
        case "set-loan":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "loan");
        case "set-bank-limit":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "bank-limit");
        case "set-wallet-limit":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "wallet-limit");
        case "uni":
        case "university":
            {
                const { handleEducation } = require("./commands/life/education");
                return handleEducation(message, args);
            }
        case "set-fd-interest":
        case "set-fd":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "fd");
        case "set-rd-interest":
        case "set-rd":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "rd");
        case "set-tax":
        case "market-tax":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "tax");
        case "set-credit-reward":
        case "set-reward":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "credit-reward");
        case "set-credit-penalty":
        case "set-penalty":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "credit-penalty");
        case "set-credit-cap":
        case "credit-cap":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "credit-cap");
        case "set-min-credit-cap":
        case "min-credit-cap":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "min-credit-cap");
        case "set-max-loans":
        case "max-loans":
            return (0, setEconomyConfig_1.handleSetEconomyConfig)(message, args, "max-loans");
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
            return (0, adminDashboard_1.handleAdminDashboard)(message);
        }
        case "reset-admin-settings":
        case "reset-permissions":
        case "reset-perms":
        case "reset-access": {
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
        // JOBS REMOVED AS PER REQUEST
        /*
        case "jobs": {
           // ...
        }
        */
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
        case "bookstore": {
            const { handleUniStore } = require("./commands/life/uniStore");
            return handleUniStore(message);
        }
        case "manage-uni":
        case "uni-admin": {
            const { handleManageUniStore } = require("./commands/admin/manageUniStore");
            return handleManageUniStore(message, args);
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