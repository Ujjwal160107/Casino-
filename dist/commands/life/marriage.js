"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleMarry = handleMarry;
exports.handleDivorce = handleDivorce;
exports.handleFamily = handleFamily;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const embed_1 = require("../../utils/embed");
const branding_1 = require("../../config/branding");
const marriageService_1 = require("../../services/life/marriageService");
const discordLogger_1 = require("../../utils/discordLogger");
async function handleMarry(message, args) {
    if (message.mentions.users.size === 0) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", "You must mention someone to marry!")] });
    }
    const target = message.mentions.users.first();
    if (!target || target.bot || target.id === message.author.id) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid User", "You cannot marry a bot or yourself!")] });
    }
    // Double check if users exist in DB (usually handled, but good to ensure)
    // ... (Assuming user existence checks are done or Prisma will throw/create)
    // Check if already married
    // FIX: Pass guildId
    if (await (0, marriageService_1.isMarried)(message.author.id, message.guildId)) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Already Married", "You are already married! Divorce first if you want to remarry.")] });
    }
    if (await (0, marriageService_1.isMarried)(target.id, message.guildId)) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Taken", `${target.username} is already married!`)] });
    }
    // Check for Ring
    // FIX: Pass guildId
    const hasRing = await (0, marriageService_1.checkHasRing)(message.author.id, message.guildId);
    if (!hasRing) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "No Ring", "You need a **Ring** to propose! Buy one from the shop.")] });
    }
    // Send Proposal
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('accept_proposal')
        .setLabel('Accept')
        .setStyle(discord_js_1.ButtonStyle.Success)
        .setEmoji('💍'), // Or check for custom emote
    new discord_js_1.ButtonBuilder()
        .setCustomId('decline_proposal')
        .setLabel('Decline')
        .setStyle(discord_js_1.ButtonStyle.Danger));
    const proposalEmbed = new discord_js_1.EmbedBuilder()
        .setColor("#ff69b4") // Pink/Romance color
        .setTitle(`💍 Marriage Proposal`)
        .setDescription(`${target}, **${message.author.username}** has proposed to you! \n\nDo you accept their hand in marriage?`)
        .setImage("attachment://marriage_proposal.png")
        .setFooter({ text: "You have 60 seconds to answer." });
    // We need to attach the local file
    const msg = await message.reply({
        content: `${target}`,
        embeds: [proposalEmbed],
        components: [row],
        files: ["./assets/marriage_proposal.png"]
    });
    const collector = msg.createMessageComponentCollector({ componentType: discord_js_1.ComponentType.Button, time: 60000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== target.id) {
            await i.reply({ content: "This proposal is not for you!", ephemeral: true });
            return;
        }
        if (i.customId === 'accept_proposal') {
            try {
                // Re-check ring just in case they dropped it? Unlikely in 60s but safe.
                const stillHasRing = await (0, marriageService_1.checkHasRing)(message.author.id, message.guildId);
                if (!stillHasRing) {
                    await i.update({ content: " Proposal Failed", embeds: [(0, embed_1.errorEmbed)(target, "Proposal Failed", "The proposer lost the ring!")], components: [] });
                    return;
                }
                // Check if target is already married before consuming ring (race condition check)
                if (await (0, marriageService_1.isMarried)(target.id, message.guildId)) {
                    await i.update({ content: null, embeds: [(0, embed_1.errorEmbed)(target, "Proposal Failed", "You are already married!")], components: [] });
                    return;
                }
                // Check if author is already married (race condition check)
                if (await (0, marriageService_1.isMarried)(message.author.id, message.guildId)) {
                    await i.update({ content: null, embeds: [(0, embed_1.errorEmbed)(target, "Proposal Failed", "The proposer is already married!")], components: [] });
                    return;
                }
                await (0, marriageService_1.consumeRing)(message.author.id, message.guildId);
                await (0, marriageService_1.marry)(message.author.id, message.author.username, target.id, target.username, message.guildId);
                await (0, discordLogger_1.logToChannel)(message.client, {
                    guild: message.guild,
                    type: "TRADE",
                    title: "Marriage Created",
                    description: `**${message.author.tag}** married **${target.tag}**!`,
                    color: 0xFF69B4
                });
                const acceptEmbed = new discord_js_1.EmbedBuilder()
                    .setColor("#ff69b4")
                    .setTitle(`💖 Just Married! 💖`)
                    .setDescription(`Congratulations! **${message.author.username}** and **${target.username}** are now married! 🎉`)
                    .setThumbnail((0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Love) || "");
                await i.update({ content: null, embeds: [acceptEmbed], components: [], files: [], attachments: [] });
            }
            catch (err) {
                await i.update({ content: null, embeds: [(0, embed_1.errorEmbed)(target, "Marriage Failed", err.message || "An error occurred.")], components: [] });
            }
        }
        else {
            const declineEmbed = new discord_js_1.EmbedBuilder()
                .setColor("#ff0000")
                .setTitle("💔 Proposal Declined")
                .setDescription(`${target.username} has declined the proposal.`);
            await i.update({ content: null, embeds: [declineEmbed], components: [], files: [], attachments: [] });
        }
        collector.stop();
    });
    collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            // Edit to show timeout
            const timeoutEmbed = new discord_js_1.EmbedBuilder()
                .setColor("#808080")
                .setTitle("Proposal Expired")
                .setDescription("The proposal timed out.");
            await msg.edit({ content: null, embeds: [timeoutEmbed], components: [] }).catch(() => { });
        }
    });
}
async function handleDivorce(message) {
    const married = await (0, marriageService_1.isMarried)(message.author.id, message.guildId);
    if (!married) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Married", "You are not married!")] });
    }
    const marriage = await (0, marriageService_1.getMarriage)(message.author.id, message.guildId);
    if (!marriage)
        return; // Should be handled by isMarried check
    // Identify Spouse
    const spouseRecord = marriage.spouse1.discordId === message.author.id ? marriage.spouse2 : marriage.spouse1;
    const spouseId = spouseRecord.discordId;
    // Warning confirmation?
    const row = new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('confirm_divorce')
        .setLabel('Accept Divorce')
        .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
        .setCustomId('cancel_divorce')
        .setLabel('Decline')
        .setStyle(discord_js_1.ButtonStyle.Secondary));
    const confirmEmbed = (0, embed_1.errorEmbed)(message.author, "Divorce Request", `**${message.author.username}** wants to divorce you. Do you accept?`);
    confirmEmbed.setDescription(`<@${spouseId}>, **${message.author.username}** has requested a divorce.\n\nDo you agree to end this marriage?`);
    const msg = await message.reply({ content: `<@${spouseId}>`, embeds: [confirmEmbed], components: [row] });
    const collector = msg.createMessageComponentCollector({ componentType: discord_js_1.ComponentType.Button, time: 60000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== spouseId) {
            await i.reply({ content: "This divorce request is not for you!", ephemeral: true });
            return;
        }
        if (i.customId === 'confirm_divorce') {
            await (0, marriageService_1.divorce)(message.author.id, message.guildId);
            await (0, discordLogger_1.logToChannel)(message.client, {
                guild: message.guild,
                type: "TRADE",
                title: "Divorce Finalized",
                description: `**${message.author.tag}** divorced <@${spouseId}>.`,
                color: 0x000000
            });
            const divorcedEmbed = new discord_js_1.EmbedBuilder()
                .setColor("#000000")
                .setTitle("💔 Divorced")
                .setDescription(`**${message.author.username}** and <@${spouseId}> are now divorced.`);
            await i.update({ content: null, embeds: [divorcedEmbed], components: [] });
        }
        else {
            const cancelEmbed = new discord_js_1.EmbedBuilder()
                .setColor(branding_1.Mascot.Colors.Success) // Or some neutral color
                .setTitle("Divorce Cancelled")
                .setDescription("The divorce request was declined. You are still married.");
            await i.update({ content: null, components: [], embeds: [cancelEmbed] });
        }
        collector.stop();
    });
    collector.on('end', async (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            const timeoutEmbed = new discord_js_1.EmbedBuilder()
                .setColor("#808080")
                .setTitle("Divorce Request Expired")
                .setDescription("The divorce request timed out.");
            await msg.edit({ content: null, embeds: [timeoutEmbed], components: [] }).catch(() => { });
        }
    });
}
async function handleJointBalance(message) {
    const marriage = await (0, marriageService_1.getMarriage)(message.author.id, message.guildId);
    if (!marriage)
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Married", "You don't have a joint account nearby.")] });
    const embed = new discord_js_1.EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`🏦 Joint Bank Account`)
        .setDescription(`**Balance**: ${marriage.jointBalance.toLocaleString('en-US')} coins`)
        .setFooter({ text: "Secure from robberies!" });
    return message.reply({ embeds: [embed] });
}
async function handleJointDeposit(message, args) {
    // args[1] is amount
    if (!args[1])
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", "Usage: `!marriage deposit <amount|all>`")] });
    let amount = 0;
    if (args[1].toLowerCase() === 'all') {
        const user = await prisma_1.default.user.findUnique({
            where: { discordId_guildId: { discordId: message.author.id, guildId: message.guildId } },
            include: { wallet: true }
        });
        if (!user || !user.wallet || user.wallet.balance <= 0) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Insufficient Funds", "You have no money to deposit!")] });
        }
        amount = user.wallet.balance;
    }
    else {
        amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0)
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", "Please specify a valid amount.")] });
    }
    try {
        const newBal = await (0, marriageService_1.depositToJoint)(message.author.id, message.guildId, amount);
        await (0, discordLogger_1.logToChannel)(message.client, {
            guild: message.guild,
            type: "ECONOMY",
            title: "Joint Account Deposit",
            description: `**User:** ${message.author.tag}\n**Amount:** ${amount.toLocaleString('en-US')} coins\n**New Balance:** ${newBal.toLocaleString('en-US')}`
        });
        const embed = (0, embed_1.successEmbed)(message.author, "Deposit Successful", `Deposited **${amount.toLocaleString('en-US')}** coins to your joint account.\nNew Balance: **${newBal.toLocaleString('en-US')}**`);
        return message.reply({ embeds: [embed] });
    }
    catch (e) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Transaction Failed", e.message)] });
    }
}
async function handleJointWithdraw(message, args) {
    if (!args[1])
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Usage", "Usage: `!marriage withdraw <amount|all>`")] });
    let amount = 0;
    if (args[1].toLowerCase() === 'all') {
        const marriage = await (0, marriageService_1.getMarriage)(message.author.id, message.guildId);
        if (!marriage)
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Married", "You are not married!")] });
        if (marriage.jointBalance <= 0) {
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Insufficient Funds", "Your joint account is empty!")] });
        }
        amount = marriage.jointBalance;
    }
    else {
        amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0)
            return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Invalid Amount", "Please specify a valid amount.")] });
    }
    try {
        const newBal = await (0, marriageService_1.withdrawFromJoint)(message.author.id, message.guildId, amount);
        await (0, discordLogger_1.logToChannel)(message.client, {
            guild: message.guild,
            type: "ECONOMY",
            title: "Joint Account Withdrawal",
            description: `**User:** ${message.author.tag}\n**Amount:** ${amount.toLocaleString('en-US')} coins\n**New Balance:** ${newBal.toLocaleString('en-US')}`
        });
        const embed = (0, embed_1.successEmbed)(message.author, "Withdrawal Successful", `Withdrew **${amount.toLocaleString('en-US')}** coins from your joint account.\nNew Balance: **${newBal.toLocaleString('en-US')}**`);
        return message.reply({ embeds: [embed] });
    }
    catch (e) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Transaction Failed", e.message)] });
    }
}
async function handleFamily(message, args = []) {
    if (args.length > 0) {
        const sub = args[0].toLowerCase();
        if (sub === 'bank' || sub === 'account' || sub === 'bal')
            return handleJointBalance(message);
        if (sub === 'deposit' || sub === 'dep')
            return handleJointDeposit(message, args);
        if (sub === 'withdraw' || sub === 'with')
            return handleJointWithdraw(message, args);
    }
    const marriage = await (0, marriageService_1.getMarriage)(message.author.id, message.guildId);
    if (!marriage) {
        return message.reply({ embeds: [(0, embed_1.errorEmbed)(message.author, "Not Married", "You are single!")] });
    }
    // Determined spouse from the included relation
    // Note: getMarriage includes spouse1 and spouse2 objects
    const spouseRecord = marriage.spouse1.discordId === message.author.id ? marriage.spouse2 : marriage.spouse1;
    let spouseUser = null;
    try {
        spouseUser = await message.client.users.fetch(spouseRecord.discordId);
    }
    catch (e) {
        // User might have left
    }
    const spouseName = spouseUser ? spouseUser.username : spouseRecord.username;
    const embed = new discord_js_1.EmbedBuilder()
        .setColor("#ff69b4")
        .setTitle(`Family of ${message.author.username}`)
        .addFields({ name: "💍 Partner", value: spouseName, inline: true }, { name: "❤️ Affection", value: `${marriage.affection}`, inline: true }, { name: "🏦 Joint Savings", value: `${marriage.jointBalance.toLocaleString('en-US')}`, inline: true }, { name: "📅 Married Since", value: `<t:${Math.floor(new Date(marriage.marriedAt).getTime() / 1000)}:R>`, inline: true });
    if (spouseUser) {
        embed.setThumbnail(spouseUser.displayAvatarURL());
    }
    message.reply({ embeds: [embed] });
}
//# sourceMappingURL=marriage.js.map