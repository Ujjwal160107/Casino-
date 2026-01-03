"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const discord_js_1 = require("discord.js");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const client = new discord_js_1.Client({
    intents: [discord_js_1.GatewayIntentBits.Guilds]
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
        stream.once("open", function (fd) {
            emojis.forEach((emoji) => {
                stream.write(`${emoji.name}: <:${emoji.name}:${emoji.id}>\n`);
                console.log(`${emoji.name}: <:${emoji.name}:${emoji.id}>`);
            });
            stream.end();
        });
    }
    catch (error) {
        console.error("Error fetching emojis:", error);
    }
    finally {
        client.destroy();
    }
});
client.login(process.env.TOKEN);
//# sourceMappingURL=fetchEmojis.js.map