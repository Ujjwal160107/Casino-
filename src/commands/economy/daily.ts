
import { Message } from "discord.js";
import { handleReward } from "./rewards";

export async function handleDaily(message: Message) {
    return handleReward(message, "daily");
}
