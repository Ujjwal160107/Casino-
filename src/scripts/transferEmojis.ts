import { Client, GatewayIntentBits } from 'discord.js';
import fs from 'fs';
import path from 'path';

async function main() {
    const mainToken = process.argv[2];
    const testToken = process.argv[3];
    const replaceBranding = process.argv[4] === '--replace';

    if (!mainToken || !testToken) {
        console.error("Usage: ts-node src/scripts/transferEmojis.ts <MAIN_BOT_TOKEN> <TEST_BOT_TOKEN> [--replace]");
        console.error("  --replace: Will automatically attempt to update src/config/branding.ts with the new IDs");
        process.exit(1);
    }

    console.log("Logging into main bot...");
    const mainClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    await mainClient.login(mainToken);
    console.log(`Logged into main bot: ${mainClient.user?.tag} (App ID: ${mainClient.application?.id})`);

    console.log("Logging into test bot...");
    const testClient = new Client({ intents: [GatewayIntentBits.Guilds] });
    await testClient.login(testToken);
    console.log(`Logged into test bot: ${testClient.user?.tag} (App ID: ${testClient.application?.id})`);

    // Fetch emojis
    console.log("Fetching emojis...");
    const mainEmojis = await mainClient.application?.emojis.fetch();
    const testEmojis = await testClient.application?.emojis.fetch();
    
    if (!mainEmojis || !testEmojis) {
        console.error("Could not fetch emojis. Make sure both bots have application intents correctly set and bot tokens are valid.");
        process.exit(1);
    }

    console.log(`Found ${mainEmojis.size} emojis in main bot.`);
    console.log(`Found ${testEmojis.size} emojis in test bot.`);

    const oldIdToNewEmojiObj = new Map<string, any>(); 

    for (const [id, emoji] of mainEmojis) {
        if (!emoji.name) continue;

        let targetEmojiObj = testEmojis.find(e => e.name === emoji.name);
        
        if (targetEmojiObj) {
            console.log(`Test bot already has emoji ${emoji.name} (${targetEmojiObj.id})`);
        } else {
            console.log(`Copying emoji ${emoji.name}...`);
            try {
                if (!emoji.url) {
                    console.error(`Emoji ${emoji.name} has no URL.`);
                    continue;
                }
                const created = await testClient.application?.emojis.create({
                    attachment: emoji.url,
                    name: emoji.name,
                });
                if (created) {
                    console.log(`Created emoji ${emoji.name} (${created.id})`);
                    targetEmojiObj = created;
                }
            } catch (error) {
                console.error(`Failed to copy emoji ${emoji.name}:`, error);
                // Depending on rate limits, we might want to wait a bit
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }
        
        if (targetEmojiObj) {
            oldIdToNewEmojiObj.set(id, targetEmojiObj);
        }
    }

    mainClient.destroy();
    testClient.destroy();

    console.log("\n--- Transfer Complete ---");

    if (replaceBranding) {
        const brandingPath = path.join(__dirname, '..', 'config', 'branding.ts');
        if (fs.existsSync(brandingPath)) {
            let content = fs.readFileSync(brandingPath, 'utf8');
            let replaceCount = 0;

            for (const [oldId, newObj] of oldIdToNewEmojiObj) {
                // We'll replace instances of the old ID with the new ID
                // But we must also ensure we're matching the animation flag properly if needed.
                // It usually looks like <:name:id> or <a:name:id>
                const isAnimatedOld = content.includes(`<a:`);
                // Simple regex to replace the specific old ID
                const idRegex = new RegExp(oldId, 'g');
                
                if (idRegex.test(content)) {
                    content = content.replace(idRegex, newObj.id);
                    replaceCount++;
                }
            }

            fs.writeFileSync(brandingPath, content, 'utf8');
            console.log(`Updated branding.ts - replaced ${replaceCount} emoji ID occurrences.`);
            console.log('IMPORTANT: Please verify the changes to branding.ts before committing.');
        } else {
            console.error(`Could not find branding.ts at ${brandingPath}`);
        }
    } else {
        console.log("Run with --replace to automatically update src/config/branding.ts.");
    }
}

main().catch(console.error);
