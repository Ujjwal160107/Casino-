/**
 * Deletes stale guild-scoped slash commands from every server the bot is in.
 *
 * DRY RUN BY DEFAULT. Pass --apply to actually clear them.
 *
 *   npx ts-node --transpile-only src/scripts/clearGuildCommands.ts
 *   npx ts-node --transpile-only src/scripts/clearGuildCommands.ts --apply
 *
 * Commands are registered globally (see index.ts), so no guild should hold any
 * of its own. An older version of the bot registered per guild and the cleanup
 * never ran: the routine only cleared a guild when it had commands to write,
 * and by then it had none, so it returned early and left the old set in place.
 *
 * Discord shows guild commands alongside global ones, so those leftovers appear
 * in the picker and answer "Unknown command." when used, because nothing in the
 * slash registry matches them.
 */
import "dotenv/config";

const TOKEN = process.env.DISCORD_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const APPLY = process.argv.includes("--apply");

if (!TOKEN || !CLIENT_ID) {
    console.error("DISCORD_TOKEN and CLIENT_ID must be set.");
    process.exit(1);
}

const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function allGuilds(): Promise<{ id: string; name: string }[]> {
    const guilds: { id: string; name: string }[] = [];
    let after = "";
    // 200 is the per-page maximum; keep paging until a short page comes back.
    for (;;) {
        const url = `${API}/users/@me/guilds?limit=200${after ? `&after=${after}` : ""}`;
        const res = await fetch(url, { headers });
        if (!res.ok) throw new Error(`listing guilds: ${res.status} ${await res.text()}`);
        const page = (await res.json()) as { id: string; name: string }[];
        guilds.push(...page);
        if (page.length < 200) return guilds;
        after = page[page.length - 1].id;
        await sleep(250);
    }
}

async function main() {
    console.log(APPLY ? "*** APPLYING ***\n" : "DRY RUN -- nothing will be deleted\n");

    const guilds = await allGuilds();
    console.log(`bot is in ${guilds.length} guild(s)\n`);

    let withCommands = 0;
    let cleared = 0;
    let failed = 0;

    for (const g of guilds) {
        const res = await fetch(`${API}/applications/${CLIENT_ID}/guilds/${g.id}/commands`, { headers });
        if (!res.ok) {
            // A guild the bot can no longer read is not worth failing over.
            console.log(`  SKIP  ${g.name} (${res.status})`);
            failed++;
            await sleep(300);
            continue;
        }

        const cmds = (await res.json()) as { name: string }[];
        if (!Array.isArray(cmds) || cmds.length === 0) {
            await sleep(120);
            continue;
        }

        withCommands++;
        console.log(`  ${String(cmds.length).padStart(3)} in ${g.name}`);

        if (APPLY) {
            // PUT with an empty array replaces the guild's whole command set,
            // which is one request instead of one DELETE per command.
            const del = await fetch(`${API}/applications/${CLIENT_ID}/guilds/${g.id}/commands`, {
                method: "PUT",
                headers,
                body: "[]",
            });
            if (del.ok) {
                cleared++;
            } else {
                console.log(`        FAILED to clear: ${del.status} ${await del.text()}`);
                failed++;
            }
        }
        // Deliberately unhurried. This runs once, and tripping a rate limit
        // across 100+ guilds costs far more time than the wait does.
        await sleep(400);
    }

    console.log(`\nguilds holding stale commands: ${withCommands}`);
    if (APPLY) {
        console.log(`cleared: ${cleared}`);
        if (failed) console.log(`failed/skipped: ${failed}`);
    } else {
        console.log("\nRe-run with --apply to clear them.");
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
