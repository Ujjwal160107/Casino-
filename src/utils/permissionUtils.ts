import { Message, GuildMember } from "discord.js";
import prisma from "./prisma";

export const BOT_OWNER_ID = "1288340046449086567";

export async function canExecuteAdminCommand(message: Message, member?: GuildMember): Promise<boolean> {
    if (!member) member = message.member!;
    if (!member) return false;

    if (message.author.id === BOT_OWNER_ID) return true;
    if (message.author.id === message.guild?.ownerId) return true;
    if (member.permissions.has("Administrator")) return true;

    // Check for Casino Admin
    if (message.guild) {
        const user = await prisma.user.findUnique({
            where: {
                discordId_guildId: {
                    discordId: member.id,
                    guildId: message.guild.id
                }
            },
            select: { isCasinoAdmin: true }
        });
        if (user?.isCasinoAdmin) return true;
    }

    return false;
}

export function canExecuteRestrictedAdminCommand(message: Message, member?: GuildMember): boolean {
    if (!member) member = message.member!;
    if (!member) return false;

    if (message.author.id === BOT_OWNER_ID) return true;
    if (message.author.id === message.guild?.ownerId) return true;
    if (member.permissions.has("Administrator")) return true;

    return false;
}