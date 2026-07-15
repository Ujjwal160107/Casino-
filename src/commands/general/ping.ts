import { Message } from "discord.js";
import prisma from "../../utils/prisma";
import { redisService } from "../../services/redisService";
import { infoContainer, v2Reply } from "../../utils/componentsV2";

export async function handlePing(message: Message) {
    const start = Date.now();
    // Reply with a Components-V2 placeholder so the final msg.edit() below (also
    // V2) is a V2->V2 edit. Discord rejects toggling the IsComponentsV2 flag on an
    // existing message, so a plain-text placeholder here makes the edit throw and
    // the "Calculating latency..." message stick.
    const msg = await message.reply(v2Reply(infoContainer("System Status Dashboard", "Calculating latency...")));

    const apiLatency = msg.createdTimestamp - message.createdTimestamp;
    let wsLatency: number | string = message.client.ws.ping;
    if (wsLatency === -1) wsLatency = "Catching up...";

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

    const desc =
        `**Latency Metrics**\n**API Response:** ${apiLatency}ms\n**WebSocket:** ${wsLatency}ms\n**Database:** ${dbLatency}ms\n**Redis Cache:** ${redisLatency}ms\n\n` +
        `**System Health**\n**Uptime:** ${uptimeHrs}h ${uptimeMins}m\n**RAM Usage:** ${ramUsed} MB\n**Status:** ONLINE`;

    await msg.edit(v2Reply(infoContainer("System Status Dashboard", desc)));
}
