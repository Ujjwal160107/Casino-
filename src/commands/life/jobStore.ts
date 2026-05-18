import { Message } from "discord.js";

const STORE_MOVED_MESSAGE = "This store has moved to the main shop system and is temporarily unavailable.";

export async function handleJobStore(message: Message) {
    return message.reply(STORE_MOVED_MESSAGE);
}
