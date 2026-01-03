
import { Message } from "discord.js";
import { handleReward } from "./rewards";

export async function handleWeekly(message: Message) {
    return handleReward(message, "weekly");
}
