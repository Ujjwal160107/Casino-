import { Message, GuildMember } from "discord.js";
import { BOT_DEVELOPER_ID, isBotDeveloper } from "./developerAccess";

export const BOT_OWNER_ID = BOT_DEVELOPER_ID;

export async function canExecuteAdminCommand(message: Message, member?: GuildMember): Promise<boolean> {
    return isBotDeveloper(message.author.id);
}

export function canExecuteRestrictedAdminCommand(message: Message, member?: GuildMember): boolean {
    return isBotDeveloper(message.author.id);
}
