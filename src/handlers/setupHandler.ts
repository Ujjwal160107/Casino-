import { ActionRowBuilder, ButtonInteraction, ModalBuilder, TextInputBuilder, TextInputStyle, ModalSubmitInteraction, StringSelectMenuBuilder, StringSelectMenuInteraction, Interaction, EmbedBuilder, ButtonBuilder, ButtonStyle } from "discord.js";
import prisma from "../utils/prisma";
import { updateGuildConfig, getGuildConfig } from "../services/guildConfigService";
import { Mascot } from "../config/branding";
import { parseSmartAmount, formatDuration } from "../utils/format";
import { parseDuration } from "../utils/duration";

export async function handleSetupInteraction(interaction: Interaction) {
    if (interaction.isButton()) {
        const id = interaction.customId;

        if (id === "setup_general") {
            const config = await getGuildConfig(interaction.guildId!);
            const modal = new ModalBuilder()
                .setCustomId("modal_setup_general")
                .setTitle("General Economy Settings");

            const currencyName = new TextInputBuilder()
                .setCustomId("currency_name")
                .setLabel("Currency Name")
                .setValue(config.currencyName)
                .setStyle(TextInputStyle.Short);

            const currencyEmoji = new TextInputBuilder()
                .setCustomId("currency_emoji")
                .setLabel("Currency Emoji")
                .setValue(config.currencyEmoji)
                .setStyle(TextInputStyle.Short);

            const startMoney = new TextInputBuilder()
                .setCustomId("start_money")
                .setLabel("Starting Money")
                .setValue(config.startMoney.toString())
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(currencyName),
                new ActionRowBuilder<TextInputBuilder>().addComponents(currencyEmoji),
                new ActionRowBuilder<TextInputBuilder>().addComponents(startMoney),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder().setCustomId("log_channel").setLabel("Log Channel ID (Optional)").setValue(config.logChannelId || "").setStyle(TextInputStyle.Short).setRequired(false)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder().setCustomId("casino_channels").setLabel("Casino Channel IDs (comma separated)").setValue(config.casinoChannels.join(", ")).setStyle(TextInputStyle.Short).setRequired(false)
                )
            );

            await interaction.showModal(modal);
        } else if (id === "setup_banking") {
            const config = await getGuildConfig(interaction.guildId!);
            const modal = new ModalBuilder()
                .setCustomId("modal_setup_banking")
                .setTitle("Banking Settings");

            const bankLimit = new TextInputBuilder()
                .setCustomId("bank_limit")
                .setLabel("Bank Limit (0 for unlimited)")
                .setValue(config.bankLimit?.toString() || "0")
                .setStyle(TextInputStyle.Short);

            const walletLimit = new TextInputBuilder()
                .setCustomId("wallet_limit")
                .setLabel("Wallet Limit (0 for unlimited)")
                .setValue(config.walletLimit?.toString() || "0")
                .setStyle(TextInputStyle.Short);

            const loanInterest = new TextInputBuilder()
                .setCustomId("loan_interest")
                .setLabel("Loan Interest Rate (%)")
                .setValue(config.loanInterestRate.toString())
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(bankLimit),
                new ActionRowBuilder<TextInputBuilder>().addComponents(walletLimit),
                new ActionRowBuilder<TextInputBuilder>().addComponents(loanInterest)
            );

            await interaction.showModal(modal);
        } else if (id === "setup_jobs") {
            // Show select menu for Sector or Level interaction
            const row = new ActionRowBuilder<StringSelectMenuBuilder>()
                .addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId("select_setup_jobs")
                        .setPlaceholder("Select what to configure")
                        .addOptions([
                            { label: "Configure Sector Base Pay", value: "sector", description: "Set base salaries for Tech, Medical, etc." },
                            { label: "Configure Level Multipliers", value: "level", description: "Set multipliers for Intern, Senior, etc." }
                        ])
                );

            await interaction.reply({ content: "What would you like to configure?", components: [row], ephemeral: true });

        } else if (id === "setup_crime") {
            const config = await getGuildConfig(interaction.guildId!);
            const modal = new ModalBuilder()
                .setCustomId("modal_setup_crime")
                .setTitle("Crime Settings");

            const success = new TextInputBuilder()
                .setCustomId("rob_success")
                .setLabel("Rob Success Rate (%)")
                .setValue(config.robSuccessPct.toString())
                .setStyle(TextInputStyle.Short);

            const fine = new TextInputBuilder()
                .setCustomId("rob_fine")
                .setLabel("Rob Fine (%)")
                .setValue(config.robFinePct.toString())
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(success),
                new ActionRowBuilder<TextInputBuilder>().addComponents(fine),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder().setCustomId("jail_fine").setLabel("Jail Bail Cost").setValue(config.jailFine.toString()).setStyle(TextInputStyle.Short)
                ),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder().setCustomId("jail_time").setLabel("Jail Time (e.g. 10m, 1h)").setValue(formatDuration(config.jailTime)).setStyle(TextInputStyle.Short)
                )
            );

            await interaction.showModal(modal);

        } else if (id === "setup_gambling") {
            const config = await getGuildConfig(interaction.guildId!);
            const modal = new ModalBuilder()
                .setCustomId("modal_setup_gambling")
                .setTitle("Gambling Settings");

            const minBet = new TextInputBuilder()
                .setCustomId("min_bet")
                .setLabel("Minimum Bet")
                .setValue(config.minBet.toString())
                .setStyle(TextInputStyle.Short);

            const maxBet = new TextInputBuilder()
                .setCustomId("max_bet")
                .setLabel("Maximum Bet (0 for unlimited)")
                .setValue(config.maxBet?.toString() || "0")
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(minBet),
                new ActionRowBuilder<TextInputBuilder>().addComponents(maxBet),
                new ActionRowBuilder<TextInputBuilder>().addComponents(
                    new TextInputBuilder().setCustomId("roulette_spin_time").setLabel("Roulette Spin Time (seconds)").setValue(config.rouletteSpinTime?.toString() || "3").setStyle(TextInputStyle.Short)
                )
            );

            await interaction.showModal(modal);

        } else if (id === "setup_education") {
            const config = await getGuildConfig(interaction.guildId!);
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

            const modal = new ModalBuilder()
                .setCustomId("modal_setup_education")
                .setTitle("Education Settings");

            const studyCd = new TextInputBuilder()
                .setCustomId("study_cd")
                .setLabel("Study Cooldown (seconds)")
                .setValue(config.studyCooldown.toString())
                .setStyle(TextInputStyle.Short);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(studyCd)
            );
            // Ideally we'd edit degrees here but that needs a complex flow. 
            // I will rely on the "Next Steps" to tell them to use !manage-uni.

            await interaction.showModal(modal);

        } else if (id === "setup_cooldowns") {
            // --- COOLDOWNS SELECT MENU ---
            const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
                new StringSelectMenuBuilder()
                    .setCustomId("select_setup_cooldown")
                    .setPlaceholder("Select a module to configure cooldown")
                    .addOptions([
                        { label: "Work Cooldown (Income)", value: "work", description: "Time between work shifts", emoji: Mascot.Emotes.JobWorking },
                        { label: "Crime Cooldown (Income)", value: "crime", description: "Time between crimes", emoji: Mascot.Emotes.Alert },
                        { label: "Beg Cooldown (Income)", value: "beg", description: "Time between begging", emoji: Mascot.Emotes.MoneyBag },
                        { label: "Slut Cooldown (Income)", value: "slut", description: "Time between slut actions", emoji: Mascot.Emotes.Love },
                        { label: "Robbery Cooldown", value: "rob", description: "Time between robberies", emoji: Mascot.Emotes.Alert },
                        { label: "Study Cooldown", value: "study", description: "Time between study sessions", emoji: Mascot.Emotes.Teacher },
                        { label: "Global Gambling Cooldown", value: "global_game", description: "Default cooldown for all gambling games", emoji: Mascot.Emotes.Money },
                        { label: "Slots Cooldown", value: "slots", description: "Cooldown for Slots", emoji: "🎰" },
                        { label: "Roulette Cooldown", value: "roulette", description: "Cooldown for Roulette", emoji: "🎡" },
                        { label: "Coinflip Cooldown", value: "coinflip", description: "Cooldown for Coinflip", emoji: "🪙" },
                        { label: "Blackjack Cooldown", value: "blackjack", description: "Cooldown for Blackjack", emoji: "🃏" },
                        { label: "Cockfight Cooldown", value: "cockfight", description: "Cooldown for Cockfight", emoji: "🐓" }
                    ])
            );

            await interaction.reply({ content: "**Select a cooldown to configure:**", components: [row], ephemeral: true });
            return;
        } else if (id === "setup_chatmoney") {
            const config = await getGuildConfig(interaction.guildId!);
            const modal = new ModalBuilder()
                .setCustomId("modal_setup_chatmoney")
                .setTitle("Chat Money Settings");

            const status = new TextInputBuilder()
                .setCustomId("chat_status")
                .setLabel("Enable System? (yes/no)")
                .setValue(config.chatMoneyEnabled ? "yes" : "no")
                .setStyle(TextInputStyle.Short);

            const interval = new TextInputBuilder()
                .setCustomId("chat_interval")
                .setLabel("Interval (seconds)")
                .setValue(config.chatMoneyInterval.toString())
                .setStyle(TextInputStyle.Short);

            const min = new TextInputBuilder()
                .setCustomId("chat_min")
                .setLabel("Min Reward")
                .setValue(config.chatMoneyMin.toString())
                .setStyle(TextInputStyle.Short);

            const max = new TextInputBuilder()
                .setCustomId("chat_max")
                .setLabel("Max Reward")
                .setValue(config.chatMoneyMax.toString())
                .setStyle(TextInputStyle.Short);

            const channels = new TextInputBuilder()
                .setCustomId("chat_channels")
                .setLabel("Channel IDs (comma separated)")
                .setValue(config.chatMoneyChannels.join(", "))
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(false);

            modal.addComponents(
                new ActionRowBuilder<TextInputBuilder>().addComponents(status),
                new ActionRowBuilder<TextInputBuilder>().addComponents(interval),
                new ActionRowBuilder<TextInputBuilder>().addComponents(min),
                new ActionRowBuilder<TextInputBuilder>().addComponents(max),
                new ActionRowBuilder<TextInputBuilder>().addComponents(channels)
            );

            await interaction.showModal(modal);

        } else if (id === "setup_next_steps") {
            const embed = new EmbedBuilder()
                .setTitle(`${Mascot.Emotes.Accept} Next Steps - Setup Complete!`)
                .setDescription("Great! You've configured the basics. Now, use these commands to fill your server with content:")
                .addFields(
                    { name: `${Mascot.Emotes.MoneyBag} Shop Items`, value: "Use `!shop-add <name> <price> <type>` to populate the store.\nUse `!manage-shop` to edit items." },
                    { name: `${Mascot.Emotes.Teacher} University Degrees`, value: "Use `!manage-uni` to create and edit degrees/courses." },
                    { name: `${Mascot.Emotes.JobWorking} Job Store`, value: "Use `!manage-jobstore` to add items required for jobs." },
                    { name: `${Mascot.Emotes.Chicken} Cockfight Store`, value: "Use `!cockstore` to shop.\n**Admins:** `!cs setprice <item> <price>`, `!cs setstock`." },
                    { name: `${Mascot.Emotes.Think} Advanced Settings`, value: "Visit the **Admin Panel** using `!admin-panel` for deeper configuration, including managing specific users, items, and bans." },
                    { name: "💡 Tip", value: "All changes made here are instant!" }
                )
                .setColor(Mascot.Colors.Base as any);

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    if (interaction.isModalSubmit()) {
        const id = interaction.customId;
        await interaction.deferReply({ ephemeral: true });

        if (id === "modal_setup_general") {
            const currencyName = interaction.fields.getTextInputValue("currency_name");
            const currencyEmoji = interaction.fields.getTextInputValue("currency_emoji");
            const startMoney = parseSmartAmount(interaction.fields.getTextInputValue("start_money"));

            if (isNaN(startMoney)) return interaction.editReply("Invalid start money amount.");

            const logChannelId = interaction.fields.getTextInputValue("log_channel");
            const casinoChannelsRaw = interaction.fields.getTextInputValue("casino_channels");

            // Check if Start Money Changed
            const currentConfig = await getGuildConfig(interaction.guildId!);
            const oldStart = currentConfig.startMoney;
            let updatedCount = 0;

            await updateGuildConfig(interaction.guildId!, {
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
                const targets = await prisma.wallet.findMany({
                    where: {
                        user: { guildId: interaction.guildId! },
                        balance: oldStart,
                        transactions: { none: {} }
                    },
                    select: { id: true }
                });

                if (targets.length > 0) {
                    await prisma.wallet.updateMany({
                        where: { id: { in: targets.map(t => t.id) } },
                        data: { balance: startMoney }
                    });
                    updatedCount = targets.length;
                }
            }

            await interaction.editReply(`✅ Configuration updated! Currency: ${currencyEmoji} ${currencyName}, Start: ${startMoney}, Logs: ${logChannelId || "None"}, Casino Channels: ${casinoChannelsRaw || "All"}${updatedCount > 0 ? `\n🔄 Updated **${updatedCount}** inactive users to new start money.` : ""}`);
        }
        else if (id === "modal_setup_banking") {
            const bankLimit = parseSmartAmount(interaction.fields.getTextInputValue("bank_limit"));
            const walletLimit = parseSmartAmount(interaction.fields.getTextInputValue("wallet_limit"));
            const loanInterest = parseFloat(interaction.fields.getTextInputValue("loan_interest"));

            if (isNaN(bankLimit) || isNaN(walletLimit) || isNaN(loanInterest)) return interaction.editReply("Invalid numbers provided.");

            await updateGuildConfig(interaction.guildId!, {
                bankLimit: bankLimit === 0 ? null : bankLimit,
                walletLimit: walletLimit === 0 ? null : walletLimit,
                loanInterestRate: loanInterest
            });
            await interaction.editReply(`✅ Banking config updated! Limits and interest rates set.`);
        }
        else if (id === "modal_setup_crime") {
            try {
                const success = parseInt(interaction.fields.getTextInputValue("rob_success"));
                const fine = parseInt(interaction.fields.getTextInputValue("rob_fine"));
                const jailFine = parseInt(interaction.fields.getTextInputValue("jail_fine"));
                const jailTimeStr = interaction.fields.getTextInputValue("jail_time");

                if (isNaN(success) || isNaN(fine) || isNaN(jailFine)) return interaction.editReply("Invalid numbers.");

                const jailTime = parseDuration(jailTimeStr);

                await updateGuildConfig(interaction.guildId!, {
                    robSuccessPct: success,
                    robFinePct: fine,
                    jailFine,
                    jailTime
                });
                await interaction.editReply(`✅ Crime config updated! Jail Time set to: ${jailTimeStr}`);
            } catch (e: any) {
                return interaction.editReply(`❌ Error: ${e.message}`);
            }
        }
        else if (id === "modal_setup_gambling") {
            const minBet = parseSmartAmount(interaction.fields.getTextInputValue("min_bet"));
            const maxBet = parseSmartAmount(interaction.fields.getTextInputValue("max_bet"));
            const spinTime = parseInt(interaction.fields.getTextInputValue("roulette_spin_time"));

            if (isNaN(minBet) || isNaN(maxBet) || isNaN(spinTime)) return interaction.editReply("Invalid numbers.");

            await updateGuildConfig(interaction.guildId!, {
                minBet,
                maxBet: maxBet === 0 ? null : maxBet,
                rouletteSpinTime: spinTime
            });
            await interaction.editReply(`✅ Gambling limits updated! Spin Time: ${spinTime}s`);
        }
        else if (id === "modal_setup_cooldowns") {
            const robCd = parseSmartAmount(interaction.fields.getTextInputValue("rob_cd"));
            const gameCd = parseSmartAmount(interaction.fields.getTextInputValue("game_cd"));

            if (isNaN(robCd) || isNaN(gameCd)) return interaction.editReply("Invalid cooldowns.");

            const config = await getGuildConfig(interaction.guildId!);
            const gameCds = (config.gameCooldowns as Record<string, number>) || {};
            gameCds["global"] = gameCd;

            await updateGuildConfig(interaction.guildId!, {
                robCooldown: robCd,
                gameCooldowns: gameCds
            });
            await interaction.editReply(`✅ Cooldowns updated!`);
        }
        else if (id === "modal_setup_education") {
            const studyCd = parseSmartAmount(interaction.fields.getTextInputValue("study_cd"));
            if (isNaN(studyCd)) return interaction.editReply("Invalid cooldown.");

            await updateGuildConfig(interaction.guildId!, {
                studyCooldown: studyCd
            });
            await interaction.editReply(`✅ Education config updated!`);
        }
        else if (id === "modal_setup_chatmoney") {
            const statusRaw = interaction.fields.getTextInputValue("chat_status").toLowerCase();
            const interval = parseInt(interaction.fields.getTextInputValue("chat_interval"));
            const min = parseSmartAmount(interaction.fields.getTextInputValue("chat_min"));
            const max = parseSmartAmount(interaction.fields.getTextInputValue("chat_max"));
            const channelsRaw = interaction.fields.getTextInputValue("chat_channels");

            if (isNaN(interval) || isNaN(min) || isNaN(max)) return interaction.editReply("Invalid numbers provided.");
            if (min > max) return interaction.editReply("Min reward cannot be greater than Max reward.");

            const enabled = ["yes", "on", "true", "enable", "1"].includes(statusRaw);
            const channels = channelsRaw ? channelsRaw.split(",").map(id => id.trim()).filter(id => id.length > 0) : [];

            if (channels.length > 5) return interaction.editReply("You can only have up to 5 chat money channels.");

            await updateGuildConfig(interaction.guildId!, {
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
            const pay = parseSmartAmount(interaction.fields.getTextInputValue("base_pay"));

            if (!sector || isNaN(pay)) return interaction.editReply("Invalid input.");

            const config = await getGuildConfig(interaction.guildId!);
            const sectors = (config.jobSectorBasePay as Record<string, number>) || {};
            sectors[sector] = pay;

            await updateGuildConfig(interaction.guildId!, { jobSectorBasePay: sectors });
            await interaction.editReply(`✅ Updated base pay for **${sector}** to **${pay}**.`);
        }
        else if (id === "modal_setup_job_level") {
            const level = interaction.fields.getTextInputValue("level_name");
            const multi = parseFloat(interaction.fields.getTextInputValue("multiplier"));

            if (!level || isNaN(multi)) return interaction.editReply("Invalid input.");

            const config = await getGuildConfig(interaction.guildId!);
            const levels = (config.jobLevelMultipliers as Record<string, number>) || {};
            levels[level] = multi;

            await updateGuildConfig(interaction.guildId!, { jobLevelMultipliers: levels });
            await interaction.editReply(`✅ Updated multiplier for **${level}** to **${multi}x**.`);
        }
        else if (id.startsWith("modal_setup_cd_")) {
            const type = id.replace("modal_setup_cd_", "");
            const rawVal = interaction.fields.getTextInputValue("val_duration");

            try {
                const seconds = parseDuration(rawVal);

                if (type === "rob") {
                    await updateGuildConfig(interaction.guildId!, { robCooldown: seconds });
                } else if (type === "study") {
                    await updateGuildConfig(interaction.guildId!, { studyCooldown: seconds });
                } else if (type === "global_game") {
                    const cfg = await getGuildConfig(interaction.guildId!);
                    const cds = (cfg.gameCooldowns as Record<string, number>) || {};
                    cds["global"] = seconds;
                    await updateGuildConfig(interaction.guildId!, { gameCooldowns: cds });
                } else if (["work", "beg", "crime", "slut"].includes(type)) {
                    await prisma.incomeConfig.upsert({
                        where: { guildId_commandKey: { guildId: interaction.guildId!, commandKey: type } },
                        update: { cooldown: seconds },
                        create: {
                            guildId: interaction.guildId!,
                            commandKey: type,
                            cooldown: seconds,
                            minPay: type === "beg" ? 10 : 50,
                            maxPay: type === "beg" ? 50 : 200
                        }
                    });
                } else if (["slots", "roulette", "coinflip", "blackjack", "cockfight"].includes(type)) {
                    const cfg = await getGuildConfig(interaction.guildId!);
                    const cds = (cfg.gameCooldowns as Record<string, number>) || {};
                    cds[type] = seconds;
                    await updateGuildConfig(interaction.guildId!, { gameCooldowns: cds });
                }

                await interaction.editReply(`✅ Set **${type}** cooldown to **${rawVal}** (${seconds}s).`);
            } catch (e: any) {
                await interaction.editReply(`❌ Invalid Duration: ${e.message}`);
            }
        }
    }

    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "select_setup_jobs") {
            const selection = interaction.values[0];
            if (selection === "sector") {
                const modal = new ModalBuilder()
                    .setCustomId("modal_setup_job_sector")
                    .setTitle("Job Sector Pay");

                const sectorName = new TextInputBuilder()
                    .setCustomId("sector_name")
                    .setLabel("Sector Name (e.g. tech, medical)")
                    .setStyle(TextInputStyle.Short);

                const basePay = new TextInputBuilder()
                    .setCustomId("base_pay")
                    .setLabel("Base Pay Amount")
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(sectorName), new ActionRowBuilder<TextInputBuilder>().addComponents(basePay));
                await interaction.showModal(modal);

            } else if (selection === "level") {
                const modal = new ModalBuilder()
                    .setCustomId("modal_setup_job_level")
                    .setTitle("Job Level Multiplier");

                const levelName = new TextInputBuilder()
                    .setCustomId("level_name")
                    .setLabel("Level Name (e.g. Intern, Senior)")
                    .setStyle(TextInputStyle.Short);

                const multi = new TextInputBuilder()
                    .setCustomId("multiplier")
                    .setLabel("Multiplier (e.g. 1.5)")
                    .setStyle(TextInputStyle.Short);

                modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(levelName), new ActionRowBuilder<TextInputBuilder>().addComponents(multi));
                await interaction.showModal(modal);
            }
        } else if (interaction.customId === "select_setup_cooldown") {
            const type = interaction.values[0];
            const modal = new ModalBuilder()
                .setCustomId(`modal_setup_cd_${type}`)
                .setTitle(`Set ${type.charAt(0).toUpperCase() + type.slice(1)} Cooldown`);

            const input = new TextInputBuilder()
                .setCustomId("val_duration")
                .setLabel("Duration (e.g. 30s, 5m, 1h)")
                .setStyle(TextInputStyle.Short)
                .setPlaceholder("Example: 5m")
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder<TextInputBuilder>().addComponents(input));
            await interaction.showModal(modal);
        }
    }
}
