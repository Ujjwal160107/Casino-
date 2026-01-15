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

    const embed = new EmbedBuilder()
        .setTitle("System Status Dashboard")
        .setColor("#2b2d31") // Dark/Technical gray
        .addFields(
            { name: "Latency Metrics", value: `**API Response:** ${apiLatency}ms\n**WebSocket:** ${wsLatency}ms\n**Database:** ${dbLatency}ms\n**Redis Cache:** ${redisLatency}ms`, inline: true },
            { name: "System Health", value: `**Uptime:** ${uptimeHrs}h ${uptimeMins}m\n**RAM Usage:** ${ramUsed} MB\n**Status:** ONLINE`, inline: true }
        )
        .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();

    await msg.edit({ content: null, embeds: [embed] });
}
