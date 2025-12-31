"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleSetInt = handleSetInt;
exports.handleSetDis = handleSetDis;
exports.handleResetEdu = handleResetEdu;
exports.handleGrantDegree = handleGrantDegree;
exports.handleSetDegreeCost = handleSetDegreeCost;
exports.handleSetStudyCooldown = handleSetStudyCooldown;
const discord_js_1 = require("discord.js");
const prisma_1 = __importDefault(require("../../utils/prisma"));
const guildConfigService_1 = require("../../services/guildConfigService");
const format_1 = require("../../utils/format");
const branding_1 = require("../../config/branding");
const ADMIN_EMOJI = "<:admin:1451280807535968256>"; // Keep admin specific? Or make generic? User said remove default emojis. This looks custom.
// Let's use Mascot.Emotes for Success/Fail/Etc.
// For admin, maybe just use Success/Info.
const CHECK_EMOJI = branding_1.Mascot.Emotes.Success;
// Helper to check admin permissions
async function checkAdmin(message) {
    if (!message.member?.permissions.has("Administrator")) {
        message.reply(`${branding_1.Mascot.Emotes.Fail} You need **Administrator** permissions to use this command.`);
        return false;
    }
    return true;
}
// !setint @user <0-10>
async function handleSetInt(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const targetUser = message.mentions.users.first();
    // args: [!setint, @user, 5] -> actually args passed from router usually excludes command?
    // Let's assume generic args parsing from router: ["@user", "5"] or similar.
    // If router passes standard args (split by space, excluding cmd):
    // check target
    if (!targetUser)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!setint @user <0-10>\``);
    // Find numeric arg
    const val = parseFloat(args.find(a => !a.startsWith("<@")) || "0");
    if (isNaN(val) || val < 0 || val > 10) {
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Intelligence must be between 0 and 10.`);
    }
    const guildId = message.guild.id;
    // Fetch user with education to update both
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        include: { currentEducation: true }
    });
    if (!user) {
        return message.reply(`${branding_1.Mascot.Emotes.Fail} User not found.`);
    }
    // Update Transaction
    await prisma_1.default.$transaction(async (tx) => {
        // 1. Update Base Intelligence
        await tx.user.update({
            where: { id: user.id },
            data: { intelligence: Math.floor(val) }
        });
        // 2. Update Current GPA (Intelligence Progress) if enrolled
        if (user.currentEducation) {
            await tx.userEducation.update({
                where: { id: user.currentEducation.id },
                data: { currentGpa: val } // Use exact float value for progress
            });
        }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Intelligence Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Set **${targetUser.username}**'s Intelligence to **${val.toFixed(1)}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
// !setdis @user <0-100>
async function handleSetDis(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const targetUser = message.mentions.users.first();
    if (!targetUser)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!setdis @user <0-100>\``);
    const val = parseFloat(args.find(a => !a.startsWith("<@")) || "0");
    if (isNaN(val) || val < 0 || val > 100) {
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Discipline must be between 0 and 100.`);
    }
    const guildId = message.guild.id;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } }
    });
    if (!user)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} User not found.`);
    await prisma_1.default.user.update({
        where: { id: user.id },
        data: { discipline: Math.floor(val) }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Discipline Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Set **${targetUser.username}**'s Discipline to **${val.toFixed(0)}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
async function handleResetEdu(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const targetUser = message.mentions.users.first();
    if (!targetUser)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!resetedu @user\``);
    const guildId = message.guild.id;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        include: { currentEducation: true, degrees: true }
    });
    if (!user)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} User not found.`);
    await prisma_1.default.$transaction([
        prisma_1.default.userEducation.deleteMany({ where: { userId: user.id } }),
        prisma_1.default.userDegree.deleteMany({ where: { userId: user.id } }),
        prisma_1.default.user.update({
            where: { id: user.id },
            data: { intelligence: 0, discipline: 0 }
        })
    ]);
    message.reply(`${branding_1.Mascot.Emotes.Success} Reset education progress, degrees, and stats for **${targetUser.username}**.`);
}
async function handleGrantDegree(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const targetUser = message.mentions.users.first();
    if (!targetUser || args.length < 2)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!grantdegree @user <degree_name>\``);
    const degreeNameQuery = args.filter(a => !a.startsWith("<@")).join(" ");
    const guildId = message.guild.id;
    const degree = await prisma_1.default.degree.findFirst({
        where: { guildId, name: { contains: degreeNameQuery, mode: 'insensitive' } }
    });
    if (!degree)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Degree not found matching "${degreeNameQuery}".`);
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } }
    });
    if (!user)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} User not found.`);
    // Grant Degree
    await prisma_1.default.userDegree.create({
        data: {
            userId: user.id,
            degreeId: degree.id,
            finalGpa: 10.0,
            obtainedAt: new Date()
        }
    });
    message.reply(`${branding_1.Mascot.Emotes.Success} Granted **${degree.name}** to **${targetUser.username}**.`);
}
async function handleSetDegreeCost(message, args) {
    if (!(await checkAdmin(message)))
        return;
    // args: [!setdegree, degree_name, cost]
    // Parse last arg as cost
    const costStr = args[args.length - 1];
    const cost = parseInt(costStr);
    if (isNaN(cost) || cost < 0)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!setdegree <degree_name> <cost>\``);
    const degreeNameQuery = args.slice(0, args.length - 1).join(" "); // Remove cost
    const guildId = message.guild.id;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    // Better parsing: join all except last.
    const query = args.slice(0, -1).join(" ");
    const degree = await prisma_1.default.degree.findFirst({
        where: { guildId, name: { contains: query, mode: 'insensitive' } }
    });
    if (!degree)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Degree not found matching "${query}".`);
    await prisma_1.default.degree.update({
        where: { id: degree.id },
        data: { tuitionPerSem: cost }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Degree cost Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Accept} Updated **${degree.name}** tuition to **${(0, format_1.fmtCurrency)(cost, config.currencyEmoji)}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
async function handleSetStudyCooldown(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const cdStr = args[0];
    const cd = parseInt(cdStr);
    if (isNaN(cd) || cd < 0)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!setstudycd <seconds>\``);
    const guildId = message.guild.id;
    await prisma_1.default.guildConfig.update({
        where: { guildId },
        data: { studyCooldown: cd }
    });
    message.reply(`${branding_1.Mascot.Emotes.Success} Study cooldown set to **${cd}** seconds.`);
}
//# sourceMappingURL=educationAdmin.js.map