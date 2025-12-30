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
exports.handleSetGpa = handleSetGpa;
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
    const amountStr = args[1]; // args[0] is user mention usually, or check index
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
    await prisma_1.default.user.update({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        data: { intelligence: Math.floor(val) }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Intelligence Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Set **${targetUser.username}**'s Intelligence to **${Math.floor(val)}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
// !setdis @user <0-100>
async function handleSetDis(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const targetUser = message.mentions.users.first();
    // args: ["@user", "50"]
    if (!targetUser)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!setdis @user <0-100>\``);
    const val = parseInt(args.find(a => !a.startsWith("<@")) || "0");
    if (isNaN(val) || val < 0 || val > 100) {
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Discipline must be between 0 and 100.`);
    }
    const guildId = message.guild.id;
    await prisma_1.default.user.update({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        data: { discipline: val }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Discipline Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Set **${targetUser.username}**'s Discipline to **${val}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
// !resetedu @user
async function handleResetEdu(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const targetUser = message.mentions.users.first();
    if (!targetUser)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!resetedu @user\``);
    const guildId = message.guild.id;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } }
    });
    if (!user) {
        return message.reply(`${branding_1.Mascot.Emotes.Fail} User not found in database.`);
    }
    // Delete UserEducation, UserDegree using internal ID
    await prisma_1.default.$transaction([
        prisma_1.default.userEducation.deleteMany({ where: { userId: user.id } }),
        prisma_1.default.userDegree.deleteMany({ where: { userId: user.id } }),
    ]);
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Education Reset")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Wiped education history for **${targetUser.username}**`)
        .setColor("#2ECC71")
        .setThumbnail(targetUser.displayAvatarURL());
    message.reply({ embeds: [embed] });
}
// !grantdegree @user <degree_part_name>
async function handleGrantDegree(message, args) {
    if (!(await checkAdmin(message)))
        return;
    const targetUser = message.mentions.users.first();
    if (!targetUser)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!grantdegree @user <name>\``);
    // Extract name from args (everything that is not the mention)
    const namePart = args.filter(a => !a.startsWith("<@")).join(" ");
    if (!namePart)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Specify a degree name.`);
    const guildId = message.guild.id;
    // Find degree
    const degree = await prisma_1.default.degree.findFirst({
        where: {
            guildId,
            name: { contains: namePart, mode: 'insensitive' }
        }
    });
    if (!degree)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Degree matching "${namePart}" not found.`);
    // Find internal User ID
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        include: { currentEducation: true }
    });
    if (!user) {
        return message.reply(`${branding_1.Mascot.Emotes.Fail} User not found in database.`);
    }
    // Grant it
    // Check if duplicate?
    const existing = await prisma_1.default.userDegree.findUnique({
        where: { userId_degreeId: { userId: user.id, degreeId: degree.id } }
    });
    if (existing) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("Grant Failed")
            .setDescription(`${branding_1.Mascot.Emotes.Fail} User already has this degree.`)
            .setColor("#E74C3C"); // Error Red
        return message.reply({ embeds: [embed] });
    }
    await prisma_1.default.$transaction(async (tx) => {
        // Create Degree
        await tx.userDegree.create({
            data: {
                userId: user.id,
                degreeId: degree.id,
                finalGpa: 10.0 // Admin grant = perfect score
            }
        });
        // If enrolled in this degree, Graduate them (delete enrollment)
        // If enrolled in ANY degree, should we cancel? 
        // User asked: "when user runs ,study or ,uni the normal uni dashboard should open... degrees he has done should be done completed"
        // This implies if they get the degree, they are no longer studying it.
        // If they effectively "Finished" it via admin, we should clear the enrollment.
        if (user.currentEducation && user.currentEducation.degreeId === degree.id) {
            await tx.userEducation.delete({ where: { id: user.currentEducation.id } });
        }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Degree Granted")
        .setDescription(`${branding_1.Mascot.Emotes.Accept} Successfully granted **${degree.name}** to **${targetUser.username}**!`)
        .setColor("#2ECC71"); // Success Green;
    const teacherUrl = (0, branding_1.getEmoteUrl)(branding_1.Mascot.Emotes.Graduate);
    if (teacherUrl)
        embed.setThumbnail(teacherUrl);
    message.reply({ embeds: [embed] });
}
// !setdegreecost <name> <cost>
async function handleSetDegreeCost(message, args) {
    if (!(await checkAdmin(message)))
        return;
    // Args: ["Medical", "5000"]
    // Last arg is cost, rest is name
    if (args.length < 2)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!setdegreecost <name part> <cost>\``);
    const costStr = args[args.length - 1];
    const cost = parseInt(costStr);
    if (isNaN(cost))
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Invalid cost: ${costStr}`);
    const namePart = args.slice(0, args.length - 1).join(" ");
    const guildId = message.guild.id;
    const config = await (0, guildConfigService_1.getGuildConfig)(guildId);
    const degree = await prisma_1.default.degree.findFirst({
        where: { guildId, name: { contains: namePart, mode: 'insensitive' } }
    });
    if (!degree)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Degree matching "${namePart}" not found.`);
    await prisma_1.default.degree.update({
        where: { id: degree.id },
        data: { tuitionPerSem: cost }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Tuition Cost Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Updated tuition for **${degree.name}** to **${(0, format_1.fmtCurrency)(cost, config?.currencyEmoji || "$")}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
// !setstudycd <seconds>
async function handleSetStudyCooldown(message, args) {
    if (!(await checkAdmin(message)))
        return;
    // args: ["300"]
    if (args.length < 1)
        return message.reply(`${branding_1.Mascot.Emotes.Fail} Usage: \`!setstudycd <seconds>\``);
    let seconds = 300;
    if (args[0]?.toLowerCase() === "off") {
        seconds = 0;
    }
    else {
        seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 0) {
            const embed = new discord_js_1.EmbedBuilder()
                .setTitle("Invalid Input")
                .setDescription("Please provide a valid number of seconds or **'off'**.")
                .setColor("#E74C3C"); // Error Red
            return message.reply({ embeds: [embed] });
        }
    }
    const guildId = message.guild.id;
    await prisma_1.default.guildConfig.upsert({
        where: { guildId },
        update: { studyCooldown: seconds },
        create: { guildId, studyCooldown: seconds }
    });
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("Study Cooldown Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Updated study cooldown to **${seconds === 0 ? "Disabled" : seconds + " seconds"}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
// !setgpa @user <0.0-10.0>
async function handleSetGpa(message, args) {
    // Permission check
    if (!message.member?.permissions.has("Administrator"))
        return;
    const targetUser = message.mentions.users.first();
    const val = parseFloat(args[1]);
    if (!targetUser || isNaN(val) || val < 0 || val > 10) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("Invalid Usage")
            .setDescription(`Usage: \`!setgpa @user <0.0-10.0>\``)
            .setColor("#E74C3C");
        return message.reply({ embeds: [embed] });
    }
    const guildId = message.guild.id;
    const user = await prisma_1.default.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        include: { currentEducation: { include: { degree: true } } }
    });
    if (!user || !user.currentEducation) {
        const embed = new discord_js_1.EmbedBuilder()
            .setTitle("User Not Enrolled")
            .setDescription(`${branding_1.Mascot.Emotes.Fail} **${targetUser.username}** is not currently enrolled in any degree.`)
            .setColor("#E74C3C");
        return message.reply({ embeds: [embed] });
    }
    // Update
    await prisma_1.default.userEducation.update({
        where: { id: user.currentEducation.id },
        data: { currentGpa: val }
    });
    let schMsg = "";
    const floorGpa = Math.floor(val);
    if ([8, 9, 10].includes(floorGpa) && !user.currentEducation.scholarshipsClaimed.includes(floorGpa)) {
        schMsg = `\n\n🎉 **Scholarship Triggered!**\nUser can now claim the **GPA ${floorGpa}.0** scholarship via \`!study\`.`;
    }
    const embed = new discord_js_1.EmbedBuilder()
        .setTitle("GPA Updated")
        .setDescription(`${branding_1.Mascot.Emotes.Success} Set **${targetUser.username}**'s GPA to **${val.toFixed(1)}**${schMsg}`)
        .setColor("#2ECC71")
        .setThumbnail(targetUser.displayAvatarURL());
    message.reply({ embeds: [embed] });
}
//# sourceMappingURL=educationAdmin.js.map