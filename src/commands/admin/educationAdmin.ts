import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot, getEmoteUrl } from "../../config/branding";

const ADMIN_EMOJI = "<:admin:1451280807535968256>"; // Keep admin specific? Or make generic? User said remove default emojis. This looks custom.
// Let's use Mascot.Emotes for Success/Fail/Etc.
// For admin, maybe just use Success/Info.
const CHECK_EMOJI = Mascot.Emotes.Success;

// Helper to check admin permissions
async function checkAdmin(message: Message) {
    if (!message.member?.permissions.has("Administrator")) {
        message.reply(`${Mascot.Emotes.Fail} You need **Administrator** permissions to use this command.`);
        return false;
    }
    return true;
}

// !setint @user <0-10>
export async function handleSetInt(message: Message, args: string[]) {
    if (!(await checkAdmin(message))) return;

    const targetUser = message.mentions.users.first();
    // args: [!setint, @user, 5] -> actually args passed from router usually excludes command?
    // Let's assume generic args parsing from router: ["@user", "5"] or similar.
    // If router passes standard args (split by space, excluding cmd):
    // check target
    if (!targetUser) return message.reply(`${Mascot.Emotes.Fail} Usage: \`!setint @user <0-10>\``);

    // Find numeric arg
    const val = parseFloat(args.find(a => !a.startsWith("<@")) || "0");

    if (isNaN(val) || val < 0 || val > 10) {
        return message.reply(`${Mascot.Emotes.Fail} Intelligence must be between 0 and 10.`);
    }

    const guildId = message.guild!.id;

    // Fetch user with education to update both
    const user = await prisma.user.findUnique({
        where: { discordId_guildId: { discordId: targetUser.id, guildId } },
        include: { currentEducation: true }
    });

    if (!user) {
        return message.reply(`${Mascot.Emotes.Fail} User not found.`);
    }

    // Update Transaction
    await prisma.$transaction(async (tx) => {
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

    const embed = new EmbedBuilder()
        .setTitle("Intelligence Updated")
        .setDescription(`${Mascot.Emotes.Success} Set **${targetUser.username}**'s Intelligence to **${val.toFixed(1)}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}
