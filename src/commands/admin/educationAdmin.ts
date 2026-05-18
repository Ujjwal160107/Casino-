import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { getGuildConfig } from "../../services/guildConfigService";
import { fmtCurrency } from "../../utils/format";
import { Mascot } from "../../config/branding";
import { DEVELOPER_ONLY_COMMAND_MESSAGE, isBotDeveloper } from "../../utils/developerAccess";

const ADMIN_EMOJI = "<:admin:1451280807535968256>"; // Keep admin specific? Or make generic? User said remove default emojis. This looks custom.
// Let's use Mascot.Emotes for Success/Fail/Etc.
// For admin, maybe just use Success/Info.
const CHECK_EMOJI = Mascot.Emotes.Success;

// Helper to check admin permissions
async function checkAdmin(message: Message) {
    if (!isBotDeveloper(message.author.id)) {
        message.reply(`${Mascot.Emotes.Fail} ${DEVELOPER_ONLY_COMMAND_MESSAGE}`);
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

    // Fetch user with education to update both
    const user = await prisma.user.findUnique({
        where: { discordId: targetUser.id },
        include: { currentEducation: true }
    });

    if (!user) {
        return message.reply(`${Mascot.Emotes.Fail} User not found.`);
    }

    // Update Transaction
    await prisma.$transaction(async (tx) => {
        // 1. Update Base Intelligence
        await tx.user.update({
            where: { discordId: user.discordId },
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

// !setdis @user <0-100>
export async function handleSetDis(message: Message, args: string[]) {
    if (!(await checkAdmin(message))) return;

    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply(`${Mascot.Emotes.Fail} Usage: \`!setdis @user <0-100>\``);

    const val = parseFloat(args.find(a => !a.startsWith("<@")) || "0");

    if (isNaN(val) || val < 0 || val > 100) {
        return message.reply(`${Mascot.Emotes.Fail} Discipline must be between 0 and 100.`);
    }

    const user = await prisma.user.findUnique({
        where: { discordId: targetUser.id }
    });

    if (!user) return message.reply(`${Mascot.Emotes.Fail} User not found.`);

    await prisma.user.update({
        where: { discordId: user.discordId },
        data: { discipline: Math.floor(val) }
    });

    const embed = new EmbedBuilder()
        .setTitle("Discipline Updated")
        .setDescription(`${Mascot.Emotes.Success} Set **${targetUser.username}**'s Discipline to **${val.toFixed(0)}**`)
        .setColor("#2ECC71");
    message.reply({ embeds: [embed] });
}

export async function handleResetEdu(message: Message, args: string[]) {
    if (!(await checkAdmin(message))) return;
    const targetUser = message.mentions.users.first();
    if (!targetUser) return message.reply(`${Mascot.Emotes.Fail} Usage: \`!resetedu @user\``);

    const user = await prisma.user.findUnique({
        where: { discordId: targetUser.id },
        include: { currentEducation: true, degrees: true }
    });

    if (!user) return message.reply(`${Mascot.Emotes.Fail} User not found.`);

    await prisma.$transaction([
        prisma.userEducation.deleteMany({ where: { userId: user.discordId } }),
        prisma.userDegree.deleteMany({ where: { userId: user.discordId } }),
        prisma.user.update({
            where: { discordId: user.discordId },
            data: { intelligence: 0, discipline: 0 }
        })
    ]);

    message.reply(`${Mascot.Emotes.Success} Reset education progress, degrees, and stats for **${targetUser.username}**.`);
}

export async function handleGrantDegree(message: Message, args: string[]) {
    if (!(await checkAdmin(message))) return;
    const targetUser = message.mentions.users.first();
    if (!targetUser || args.length < 2) return message.reply(`${Mascot.Emotes.Fail} Usage: \`!grantdegree @user <degree_name>\``);

    const degreeNameQuery = args.filter(a => !a.startsWith("<@")).join(" ");
    const guildId = message.guild!.id;

    const degree = await prisma.degree.findFirst({
        where: { guildId, name: { contains: degreeNameQuery, mode: 'insensitive' } }
    });

    if (!degree) return message.reply(`${Mascot.Emotes.Fail} Degree not found matching "${degreeNameQuery}".`);

    const user = await prisma.user.findUnique({
        where: { discordId: targetUser.id }
    });

    if (!user) return message.reply(`${Mascot.Emotes.Fail} User not found.`);

    await prisma.userDegree.upsert({
        where: {
            userId_degreeId: {
                userId: user.discordId,
                degreeId: degree.id
            }
        },
        update: {
            finalGpa: 10.0,
            obtainedAt: new Date()
        },
        create: {
            userId: user.discordId,
            degreeId: degree.id,
            finalGpa: 10.0,
            obtainedAt: new Date()
        }
    });

    message.reply(`${Mascot.Emotes.Success} Granted **${degree.name}** to **${targetUser.username}**.`);
}

export async function handleSetDegreeCost(message: Message, args: string[]) {
    if (!(await checkAdmin(message))) return;
    // args: [!setdegree, degree_name, cost]
    // Parse last arg as cost
    const costStr = args[args.length - 1];
    const cost = parseInt(costStr);

    if (isNaN(cost) || cost < 0) return message.reply(`${Mascot.Emotes.Fail} Usage: \`!setdegree <degree_name> <cost>\``);

    const degreeNameQuery = args.slice(0, args.length - 1).join(" "); // Remove cost
    const guildId = message.guild!.id;
    const config = await getGuildConfig(guildId);

    // Better parsing: join all except last.
    const query = args.slice(0, -1).join(" ");

    const degree = await prisma.degree.findFirst({
        where: { guildId, name: { contains: query, mode: 'insensitive' } }
    });

    if (!degree) return message.reply(`${Mascot.Emotes.Fail} Degree not found matching "${query}".`);

    await prisma.degree.update({
        where: { id: degree.id },
        data: { tuitionPerSem: cost }
    });

    const embed = new EmbedBuilder()
        .setTitle("Degree cost Updated")
        .setDescription(`${Mascot.Emotes.Accept} Updated **${degree.name}** tuition to **${fmtCurrency(cost, config.currencyEmoji)}**`)
        .setColor("#2ECC71");

    message.reply({ embeds: [embed] });
}
