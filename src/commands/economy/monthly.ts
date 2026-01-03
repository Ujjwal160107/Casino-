
import { Message } from "discord.js";
import { handleReward } from "./rewards";

export async function handleMonthly(message: Message) {
    return handleReward(message, "monthly");
}
