import "dotenv/config";
import { REST, Routes } from "discord.js";
import fs from "fs";
import path from "path";

const commands: any[] = [];
const slashDir = path.join(__dirname, "commands", "slash");

// Read all command files from the slash directory
if (fs.existsSync(slashDir)) {
    const commandFiles = fs.readdirSync(slashDir).filter(file => file.endsWith(".ts") || file.endsWith(".js"));

    for (const file of commandFiles) {
        const filePath = path.join(slashDir, file);
        const command = require(filePath);
        if ("data" in command && "execute" in command) {
            commands.push(command.data.toJSON());
            console.log(`Loading command: ${command.data.name}`);
        } else {
            console.log(`[WARNING] The command at ${filePath} is missing a required "data" or "execute" property.`);
        }
    }
} else {
    console.error("Slash directory not found:", slashDir);
}

const rest = new REST().setToken(process.env.DISCORD_TOKEN!);

(async () => {
    try {
        console.log(`Started refreshing ${commands.length} application (/) commands.`);

        // Determine if we are deploying globally or to a specific guild
        // For development, guild-specific is faster.
        const CLIENT_ID = process.env.CLIENT_ID;
        const GUILD_ID = process.env.GUILD_ID; // Optional in .env

        if (!CLIENT_ID) {
            throw new Error("CLIENT_ID is missing in .env");
        }

        let route;
        if (GUILD_ID) {
            console.log(`Deploying to Guild: ${GUILD_ID}`);
            route = Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID);
        } else {
            console.log("Deploying Globally (this may take up to an hour to cache)");
            route = Routes.applicationCommands(CLIENT_ID);
        }

        const data: any = await rest.put(route, { body: commands });

        console.log(`Successfully reloaded ${data.length} application (/) commands.`);
    } catch (error) {
        console.error(error);
    }
})();
