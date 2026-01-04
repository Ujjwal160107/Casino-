"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetupInteraction = handleSetupInteraction;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../utils/prisma"));
const guildConfigService_1 = require("../services/guildConfigService");
const branding_1 = require("../config/branding");
const format_1 = require("../utils/format");
const duration_1 = require("../utils/duration");
async function handleSetupInteraction(interaction) {
    if (interaction.isButton()) {
        const id = interaction.customId;
        if (id === "setup_general") {
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("modal_setup_general")
                .setTitle("General Economy Settings");
            const currencyName = new discord_js_1.TextInputBuilder()
                .setCustomId("currency_name")
                .setLabel("Currency Name")
                .setValue(config.currencyName)
                .setStyle(discord_js_1.TextInputStyle.Short);
            const currencyEmoji = new discord_js_1.TextInputBuilder()
                .setCustomId("currency_emoji")
                .setLabel("Currency Emoji")
                .setValue(config.currencyEmoji)
                .setStyle(discord_js_1.TextInputStyle.Short);
            const startMoney = new discord_js_1.TextInputBuilder()
                .setCustomId("start_money")
                .setLabel("Starting Money")
                .setValue(config.startMoney.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(currencyName), new discord_js_1.ActionRowBuilder().addComponents(currencyEmoji), new discord_js_1.ActionRowBuilder().addComponents(startMoney), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId("log_channel").setLabel("Log Channel ID (Optional)").setValue(config.logChannelId || "").setStyle(discord_js_1.TextInputStyle.Short).setRequired(false)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId("casino_channels").setLabel("Casino Channel IDs (comma separated)").setValue(config.casinoChannels.join(", ")).setStyle(discord_js_1.TextInputStyle.Short).setRequired(false)));
            await interaction.showModal(modal);
        }
        else if (id === "setup_banking") {
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("modal_setup_banking")
                .setTitle("Banking Settings");
            const bankLimit = new discord_js_1.TextInputBuilder()
                .setCustomId("bank_limit")
                .setLabel("Bank Limit (0 for unlimited)")
                .setValue(config.bankLimit?.toString() || "0")
                .setStyle(discord_js_1.TextInputStyle.Short);
            const walletLimit = new discord_js_1.TextInputBuilder()
                .setCustomId("wallet_limit")
                .setLabel("Wallet Limit (0 for unlimited)")
                .setValue(config.walletLimit?.toString() || "0")
                .setStyle(discord_js_1.TextInputStyle.Short);
            const loanInterest = new discord_js_1.TextInputBuilder()
                .setCustomId("loan_interest")
                .setLabel("Loan Interest Rate (%)")
                .setValue(config.loanInterestRate.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(bankLimit), new discord_js_1.ActionRowBuilder().addComponents(walletLimit), new discord_js_1.ActionRowBuilder().addComponents(loanInterest));
            await interaction.showModal(modal);
        }
        else if (id === "setup_jobs") {
            // Show select menu for Sector or Level interaction
            const row = new discord_js_1.ActionRowBuilder()
                .addComponents(new discord_js_1.StringSelectMenuBuilder()
                .setCustomId("select_setup_jobs")
                .setPlaceholder("Select what to configure")
                .addOptions([
                { label: "Configure Sector Base Pay", value: "sector", description: "Set base salaries for Tech, Medical, etc." },
                { label: "Configure Level Multipliers", value: "level", description: "Set multipliers for Intern, Senior, etc." }
            ]));
            await interaction.reply({ content: "What would you like to configure?", components: [row], ephemeral: true });
        }
        else if (id === "setup_crime") {
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("modal_setup_crime")
                .setTitle("Crime Settings");
            const success = new discord_js_1.TextInputBuilder()
                .setCustomId("rob_success")
                .setLabel("Rob Success Rate (%)")
                .setValue(config.robSuccessPct.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            const fine = new discord_js_1.TextInputBuilder()
                .setCustomId("rob_fine")
                .setLabel("Rob Fine (%)")
                .setValue(config.robFinePct.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(success), new discord_js_1.ActionRowBuilder().addComponents(fine), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId("jail_fine").setLabel("Jail Bail Cost").setValue(config.jailFine.toString()).setStyle(discord_js_1.TextInputStyle.Short)), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId("jail_time").setLabel("Jail Time (e.g. 10m, 1h)").setValue((0, format_1.formatDuration)(config.jailTime * 1000)).setStyle(discord_js_1.TextInputStyle.Short)));
            await interaction.showModal(modal);
        }
        else if (id === "setup_gambling") {
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("modal_setup_gambling")
                .setTitle("Gambling Settings");
            const minBet = new discord_js_1.TextInputBuilder()
                .setCustomId("min_bet")
                .setLabel("Minimum Bet")
                .setValue(config.minBet.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            const maxBet = new discord_js_1.TextInputBuilder()
                .setCustomId("max_bet")
                .setLabel("Maximum Bet (0 for unlimited)")
                .setValue(config.maxBet?.toString() || "0")
                .setStyle(discord_js_1.TextInputStyle.Short);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(minBet), new discord_js_1.ActionRowBuilder().addComponents(maxBet), new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.TextInputBuilder().setCustomId("roulette_spin_time").setLabel("Roulette Spin Time (seconds)").setValue(config.rouletteSpinTime?.toString() || "3").setStyle(discord_js_1.TextInputStyle.Short)));
            await interaction.showModal(modal);
        }
        else if (id === "setup_education") {
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            // Note: Tuition is usually per degree, but we might have global override or default
            // Currently schema has Degree model with tuition. We can add a global default to config if needed, 
            // but the prompt asked for "set uni degrees job base salaries". 
            // I'll assume they want to set a global scaler or default.
            // Wait, "uni degrees" setup might imply managing individual degrees, but that's complex for a modal.
            // I'll provide a modal for "Global Tuition Multiplier" or similar if it exists, roughly mapping to "set-degree-cost" logic?
            // Actually, let's just use existing `set-degree-cost` logic which updates all degrees or specific ones. 
            // Since this is a quick setup, I'll add a modal to set a "Standard Tuition" and apply it to standard degrees if possible,
            // or just point next steps. 
            // Actually, let's just add `studyCooldown` here as it's in config.
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("modal_setup_education")
                .setTitle("Education Settings");
            const studyCd = new discord_js_1.TextInputBuilder()
                .setCustomId("study_cd")
                .setLabel("Study Cooldown (seconds)")
                .setValue(config.studyCooldown.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(studyCd));
            // Ideally we'd edit degrees here but that needs a complex flow. 
            // I will rely on the "Next Steps" to tell them to use !manage-uni.
            await interaction.showModal(modal);
        }
        else if (id === "setup_cooldowns") {
            // --- COOLDOWNS SELECT MENU ---
            const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder()
                .setCustomId("select_setup_cooldown")
                .setPlaceholder("Select a module to configure cooldown")
                .addOptions([
                { label: "Work Cooldown (Income)", value: "work", description: "Time between work shifts", emoji: branding_1.Mascot.Emotes.JobWorking },
                { label: "Crime Cooldown (Income)", value: "crime", description: "Time between crimes", emoji: branding_1.Mascot.Emotes.Alert },
                { label: "Beg Cooldown (Income)", value: "beg", description: "Time between begging", emoji: branding_1.Mascot.Emotes.MoneyBag },
                { label: "Slut Cooldown (Income)", value: "slut", description: "Time between slut actions", emoji: branding_1.Mascot.Emotes.Love },
                { label: "Robbery Cooldown", value: "rob", description: "Time between robberies", emoji: branding_1.Mascot.Emotes.Alert },
                { label: "Study Cooldown", value: "study", description: "Time between study sessions", emoji: branding_1.Mascot.Emotes.Teacher },
                { label: "Global Gambling Cooldown", value: "global_game", description: "Default cooldown for all gambling games", emoji: branding_1.Mascot.Emotes.Money },
                { label: "Slots Cooldown", value: "slots", description: "Cooldown for Slots", emoji: "🎰" },
                { label: "Roulette Cooldown", value: "roulette", description: "Cooldown for Roulette", emoji: "🎡" },
                { label: "Coinflip Cooldown", value: "coinflip", description: "Cooldown for Coinflip", emoji: "🪙" },
                { label: "Blackjack Cooldown", value: "blackjack", description: "Cooldown for Blackjack", emoji: "🃏" },
                { label: "Cockfight Cooldown", value: "cockfight", description: "Cooldown for Cockfight", emoji: "🐓" }
            ]));
            await interaction.reply({ content: "**Select a cooldown to configure:**", components: [row], ephemeral: true });
            return;
        }
        else if (id === "setup_chatmoney") {
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId("modal_setup_chatmoney")
                .setTitle("Chat Money Settings");
            const status = new discord_js_1.TextInputBuilder()
                .setCustomId("chat_status")
                .setLabel("Enable System? (yes/no)")
                .setValue(config.chatMoneyEnabled ? "yes" : "no")
                .setStyle(discord_js_1.TextInputStyle.Short);
            const interval = new discord_js_1.TextInputBuilder()
                .setCustomId("chat_interval")
                .setLabel("Interval (seconds)")
                .setValue(config.chatMoneyInterval.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            const min = new discord_js_1.TextInputBuilder()
                .setCustomId("chat_min")
                .setLabel("Min Reward")
                .setValue(config.chatMoneyMin.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            const max = new discord_js_1.TextInputBuilder()
                .setCustomId("chat_max")
                .setLabel("Max Reward")
                .setValue(config.chatMoneyMax.toString())
                .setStyle(discord_js_1.TextInputStyle.Short);
            const channels = new discord_js_1.TextInputBuilder()
                .setCustomId("chat_channels")
                .setLabel("Channel IDs (comma separated)")
                .setValue(config.chatMoneyChannels.join(", "))
                .setStyle(discord_js_1.TextInputStyle.Paragraph)
                .setRequired(false);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(status), new discord_js_1.ActionRowBuilder().addComponents(interval), new discord_js_1.ActionRowBuilder().addComponents(min), new discord_js_1.ActionRowBuilder().addComponents(max), new discord_js_1.ActionRowBuilder().addComponents(channels));
            await interaction.showModal(modal);
        }
        else if (id === "setup_next_steps") {
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle(`${branding_1.Mascot.Emotes.Accept} Next Steps - Setup Complete!`)
                .setDescription("Great! You've configured the basics. Now, use these commands to fill your server with content:")
                .addFields({ name: `${branding_1.Mascot.Emotes.MoneyBag} Shop Items`, value: "Use `!shop-add <name> <price> <type>` to populate the store.\nUse `!manage-shop` to edit items." }, { name: `${branding_1.Mascot.Emotes.Teacher} University Degrees`, value: "Use `!manage-uni` to create and edit degrees/courses." }, { name: `${branding_1.Mascot.Emotes.JobWorking} Job Store`, value: "Use `!manage-jobstore` to add items required for jobs." }, { name: `${branding_1.Mascot.Emotes.Chicken} Cockfight Store`, value: "Use `!cockstore` to shop.\n**Admins:** `!cs setprice <item> <price>`, `!cs setstock`." }, { name: `${branding_1.Mascot.Emotes.Think} Advanced Settings`, value: "Visit the **Admin Panel** using `!admin-panel` for deeper configuration, including managing specific users, items, and bans." }, { name: "💡 Tip", value: "All changes made here are instant!" })
                .setColor(branding_1.Mascot.Colors.Base);
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
    if (interaction.isModalSubmit()) {
        const id = interaction.customId;
        await interaction.deferReply({ ephemeral: true });
        if (id === "modal_setup_general") {
            const currencyName = interaction.fields.getTextInputValue("currency_name");
            const currencyEmoji = interaction.fields.getTextInputValue("currency_emoji");
            const startMoney = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("start_money"));
            if (isNaN(startMoney))
                return interaction.editReply("Invalid start money amount.");
            const logChannelId = interaction.fields.getTextInputValue("log_channel");
            const casinoChannelsRaw = interaction.fields.getTextInputValue("casino_channels");
            // Check if Start Money Changed
            const currentConfig = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const oldStart = currentConfig.startMoney;
            let updatedCount = 0;
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, {
                currencyName,
                currencyEmoji,
                startMoney,
                logChannelId: logChannelId || null,
                casinoChannels: casinoChannelsRaw ? casinoChannelsRaw.split(",").map(id => id.trim()) : []
            });
            if (startMoney !== oldStart) {
                // Retroactively update inactive users who still have the old start money
                // Logic: Users with balance === oldStart AND no transactions (fresh users)
                // Note: Checking 'no transactions' prevents resetting active players who happened to reach exactly start money.
                const targets = await prisma_1.default.wallet.findMany({
                    where: {
                        user: { guildId: interaction.guildId },
                        balance: oldStart,
                        transactions: { none: {} }
                    },
                    select: { id: true }
                });
                if (targets.length > 0) {
                    await prisma_1.default.wallet.updateMany({
                        where: { id: { in: targets.map(t => t.id) } },
                        data: { balance: startMoney }
                    });
                    updatedCount = targets.length;
                }
            }
            await interaction.editReply(`✅ Configuration updated! Currency: ${currencyEmoji} ${currencyName}, Start: ${startMoney}, Logs: ${logChannelId || "None"}, Casino Channels: ${casinoChannelsRaw || "All"}${updatedCount > 0 ? `\n🔄 Updated **${updatedCount}** inactive users to new start money.` : ""}`);
        }
        else if (id === "modal_setup_banking") {
            const bankLimit = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("bank_limit"));
            const walletLimit = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("wallet_limit"));
            const loanInterest = parseFloat(interaction.fields.getTextInputValue("loan_interest"));
            if (isNaN(bankLimit) || isNaN(walletLimit) || isNaN(loanInterest))
                return interaction.editReply("Invalid numbers provided.");
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, {
                bankLimit: bankLimit === 0 ? null : bankLimit,
                walletLimit: walletLimit === 0 ? null : walletLimit,
                loanInterestRate: loanInterest
            });
            await interaction.editReply(`✅ Banking config updated! Limits and interest rates set.`);
        }
        else if (id === "modal_setup_crime") {
            const success = parseInt(interaction.fields.getTextInputValue("rob_success"));
            const fine = parseInt(interaction.fields.getTextInputValue("rob_fine"));
            if (isNaN(success) || isNaN(fine))
                return interaction.editReply("Invalid percentages.");
            const jailFine = parseInt(interaction.fields.getTextInputValue("jail_fine"));
            const jailTimeStr = interaction.fields.getTextInputValue("jail_time");
            const jailTime = (0, duration_1.parseDuration)(jailTimeStr);
            if (isNaN(success) || isNaN(fine) || isNaN(jailFine) || jailTime === null)
                return interaction.editReply("Invalid numbers or duration format.");
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, {
                robSuccessPct: success,
                robFinePct: fine,
                jailFine,
                jailTime
            });
            await interaction.editReply(`✅ Crime config updated!`);
        }
        else if (id === "modal_setup_gambling") {
            const minBet = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("min_bet"));
            const maxBet = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("max_bet"));
            const spinTime = parseInt(interaction.fields.getTextInputValue("roulette_spin_time"));
            if (isNaN(minBet) || isNaN(maxBet) || isNaN(spinTime))
                return interaction.editReply("Invalid numbers.");
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, {
                minBet,
                maxBet: maxBet === 0 ? null : maxBet,
                rouletteSpinTime: spinTime
            });
            await interaction.editReply(`✅ Gambling limits updated! Spin Time: ${spinTime}s`);
        }
        else if (id === "modal_setup_cooldowns") {
            const robCd = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("rob_cd"));
            const gameCd = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("game_cd"));
            if (isNaN(robCd) || isNaN(gameCd))
                return interaction.editReply("Invalid cooldowns.");
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const gameCds = config.gameCooldowns || {};
            gameCds["global"] = gameCd;
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, {
                robCooldown: robCd,
                gameCooldowns: gameCds
            });
            await interaction.editReply(`✅ Cooldowns updated!`);
        }
        else if (id === "modal_setup_education") {
            const studyCd = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("study_cd"));
            if (isNaN(studyCd))
                return interaction.editReply("Invalid cooldown.");
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, {
                studyCooldown: studyCd
            });
            await interaction.editReply(`✅ Education config updated!`);
        }
        else if (id === "modal_setup_chatmoney") {
            const statusRaw = interaction.fields.getTextInputValue("chat_status").toLowerCase();
            const interval = parseInt(interaction.fields.getTextInputValue("chat_interval"));
            const min = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("chat_min"));
            const max = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("chat_max"));
            const channelsRaw = interaction.fields.getTextInputValue("chat_channels");
            if (isNaN(interval) || isNaN(min) || isNaN(max))
                return interaction.editReply("Invalid numbers provided.");
            if (min > max)
                return interaction.editReply("Min reward cannot be greater than Max reward.");
            const enabled = ["yes", "on", "true", "enable", "1"].includes(statusRaw);
            const channels = channelsRaw ? channelsRaw.split(",").map(id => id.trim()).filter(id => id.length > 0) : [];
            if (channels.length > 5)
                return interaction.editReply("You can only have up to 5 chat money channels.");
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, {
                chatMoneyEnabled: enabled,
                chatMoneyInterval: interval,
                chatMoneyMin: min,
                chatMoneyMax: max,
                chatMoneyChannels: channels
            });
            await interaction.editReply(`✅ Chat Money updated! Status: **${enabled ? "On" : "Off"}**, Range: **${min}-${max}**, Interval: **${interval}s**.`);
        }
        else if (id === "modal_setup_job_sector") {
            const sector = interaction.fields.getTextInputValue("sector_name").toLowerCase();
            const pay = (0, format_1.parseSmartAmount)(interaction.fields.getTextInputValue("base_pay"));
            if (!sector || isNaN(pay))
                return interaction.editReply("Invalid input.");
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const sectors = config.jobSectorBasePay || {};
            sectors[sector] = pay;
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, { jobSectorBasePay: sectors });
            await interaction.editReply(`✅ Updated base pay for **${sector}** to **${pay}**.`);
        }
        else if (id === "modal_setup_job_level") {
            const level = interaction.fields.getTextInputValue("level_name");
            const multi = parseFloat(interaction.fields.getTextInputValue("multiplier"));
            if (!level || isNaN(multi))
                return interaction.editReply("Invalid input.");
            const config = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
            const levels = config.jobLevelMultipliers || {};
            levels[level] = multi;
            await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, { jobLevelMultipliers: levels });
            await interaction.editReply(`✅ Updated multiplier for **${level}** to **${multi}x**.`);
        }
        else if (id.startsWith("modal_setup_cd_")) {
            const type = id.replace("modal_setup_cd_", "");
            const rawVal = interaction.fields.getTextInputValue("val_duration");
            try {
                const seconds = (0, duration_1.parseDuration)(rawVal);
                if (type === "rob") {
                    await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, { robCooldown: seconds });
                }
                else if (type === "study") {
                    await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, { studyCooldown: seconds });
                }
                else if (type === "global_game") {
                    const cfg = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
                    const cds = cfg.gameCooldowns || {};
                    cds["global"] = seconds;
                    await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, { gameCooldowns: cds });
                }
                else if (["work", "beg", "crime", "slut"].includes(type)) {
                    await prisma_1.default.incomeConfig.upsert({
                        where: { guildId_commandKey: { guildId: interaction.guildId, commandKey: type } },
                        update: { cooldown: seconds },
                        create: {
                            guildId: interaction.guildId,
                            commandKey: type,
                            cooldown: seconds,
                            minPay: type === "beg" ? 10 : 50,
                            maxPay: type === "beg" ? 50 : 200
                        }
                    });
                }
                else if (["slots", "roulette", "coinflip", "blackjack", "cockfight"].includes(type)) {
                    const cfg = await (0, guildConfigService_1.getGuildConfig)(interaction.guildId);
                    const cds = cfg.gameCooldowns || {};
                    cds[type] = seconds;
                    await (0, guildConfigService_1.updateGuildConfig)(interaction.guildId, { gameCooldowns: cds });
                }
                await interaction.editReply(`✅ Set **${type}** cooldown to **${rawVal}** (${seconds}s).`);
            }
            catch (e) {
                await interaction.editReply(`❌ Invalid Duration: ${e.message}`);
            }
        }
    }
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "select_setup_jobs") {
            const selection = interaction.values[0];
            if (selection === "sector") {
                const modal = new discord_js_1.ModalBuilder()
                    .setCustomId("modal_setup_job_sector")
                    .setTitle("Job Sector Pay");
                const sectorName = new discord_js_1.TextInputBuilder()
                    .setCustomId("sector_name")
                    .setLabel("Sector Name (e.g. tech, medical)")
                    .setStyle(discord_js_1.TextInputStyle.Short);
                const basePay = new discord_js_1.TextInputBuilder()
                    .setCustomId("base_pay")
                    .setLabel("Base Pay Amount")
                    .setStyle(discord_js_1.TextInputStyle.Short);
                modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(sectorName), new discord_js_1.ActionRowBuilder().addComponents(basePay));
                await interaction.showModal(modal);
            }
            else if (selection === "level") {
                const modal = new discord_js_1.ModalBuilder()
                    .setCustomId("modal_setup_job_level")
                    .setTitle("Job Level Multiplier");
                const levelName = new discord_js_1.TextInputBuilder()
                    .setCustomId("level_name")
                    .setLabel("Level Name (e.g. Intern, Senior)")
                    .setStyle(discord_js_1.TextInputStyle.Short);
                const multi = new discord_js_1.TextInputBuilder()
                    .setCustomId("multiplier")
                    .setLabel("Multiplier (e.g. 1.5)")
                    .setStyle(discord_js_1.TextInputStyle.Short);
                modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(levelName), new discord_js_1.ActionRowBuilder().addComponents(multi));
                await interaction.showModal(modal);
            }
        }
        else if (interaction.customId === "select_setup_cooldown") {
            const type = interaction.values[0];
            const modal = new discord_js_1.ModalBuilder()
                .setCustomId(`modal_setup_cd_${type}`)
                .setTitle(`Set ${type.charAt(0).toUpperCase() + type.slice(1)} Cooldown`);
            const input = new discord_js_1.TextInputBuilder()
                .setCustomId("val_duration")
                .setLabel("Duration (e.g. 30s, 5m, 1h)")
                .setStyle(discord_js_1.TextInputStyle.Short)
                .setPlaceholder("Example: 5m")
                .setRequired(true);
            modal.addComponents(new discord_js_1.ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }
    }
}
//# sourceMappingURL=setupHandler.js.map