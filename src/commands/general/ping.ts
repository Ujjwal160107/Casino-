import { Message, EmbedBuilder } from "discord.js";
import prisma from "../../utils/prisma";
import { redisService } from "../../services/redisService";

export async function handlePing(message: Message) {
    const start = Date.now();
    const msg = await message.reply("Calculating latency...");

    const apiLatency = msg.createdTimestamp - message.createdTimestamp;
    const wsLatency = message.client.ws.ping;

    // Database Latency
    const dbStart = Date.now();
    try {
        // MongoDB requires $runCommandRaw, not $queryRaw
        await prisma.$runCommandRaw({ ping: 1 });
    } catch (e) {
        console.error("DB Ping failed:", e);
    }
    const dbLatency = Date.now() - dbStart;

    // Redis Latency
    const redisStart = Date.now();
    try {
        await redisService.get("ping");
    } catch (e) { }
    const redisLatency = Date.now() - redisStart;

    const uptime = process.uptime();
    const uptimeHrs = Math.floor(uptime / 3600);
    const uptimeMins = Math.floor((uptime % 3600) / 60);

    const memory = process.memoryUsage();
    const ramUsed = (memory.rss / 1024 / 1024).toFixed(2);

    // Technical Dashboard Look (Code Block, No Emojis)
    // Using simple ASCII or box drawing for a clean console look
    const dashboard = `
SYSTEM STATUS DASHBOARD
=========================
[ Latency Metrics ]
• API Response : ${apiLatency}ms
• WebSocket    : ${wsLatency}ms
• Database     : ${dbLatency}ms
• Redis Cache  : ${redisLatency}ms

[ System Health ]
• Uptime       : ${uptimeHrs}h ${uptimeMins}m
• RAM Usage    : ${ramUsed} MB
• Status       : ONLINE
=========================
`;

    // Edit the message with the dashboard
    await msg.edit({ content: `\`\`\`prolog\n${dashboard}\n\`\`\`` }); // Prolog syntax highlighting usually gives nice colors for comments/numbers
}
