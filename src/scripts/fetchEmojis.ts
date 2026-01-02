import { Client, GatewayIntentBits } from "discord.js";
import dotenv from "dotenv";

dotenv.config();

const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

client.once("ready", async () => {
    console.log(`Logged in as ${client.user?.tag}!`);
    console.log("Fetching application emojis...");

    try {
        if (!client.application) {
            console.error("Client application is not ready.");
            process.exit(1);
        }

        // Ensure application info is fetched
        await client.application.fetch();

        const emojis = await client.application.emojis.fetch();
        console.log(`Found ${emojis.size} application emojis:`);

        const fs = require('fs');
        const stream = fs.createWriteStream("emojis.txt");
        stream.once("open", function (fd: any) {
            emojis.forEach((emoji) => {
                stream.write(`${emoji.name}: <:${emoji.name}:${emoji.id}>\n`);
                console.log(`${emoji.name}: <:${emoji.name}:${emoji.id}>`);
            });
            stream.end();
        });

    } catch (error) {
        console.error("Error fetching emojis:", error);
    } finally {
        client.destroy();
    }
});

client.login(process.env.TOKEN);
