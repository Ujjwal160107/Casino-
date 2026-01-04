import { Client, Message } from 'discord.js';
import { CasinoDropService } from '../services/casinoDropService';

export const setupCasinoDropListener = (client: Client) => {
    client.on('messageCreate', async (message: Message) => {
        if (message.author.bot || !message.guild) return;

        // Ensure we don't count command messages? Or do we?
        // Usually, commands shouldn't count towards activity, but user didn't specify.
        // Let's assume ANY message counts.

        try {
            await CasinoDropService.incrementMessageCount(client, message.guild.id, message.channel.id);
        } catch (error) {
            console.error("Error in casino drop listener:", error);
        }
    });
};
