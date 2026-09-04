import { ChatInputCommandInteraction, Client } from "discord.js";
import { routeMessage } from "../commandRouter";
import { createInteractionMessage } from "./interactionMessage";
import { buildArgs, SPEC_BY_NAME } from "./registry";

/**
 * Entry point for every slash command.
 *
 * Rebuilds the interaction into the prefix-command shape the router already
 * understands, then hands it to `routeMessage` -- the same path prefix and
 * @mention commands take. There is one implementation of every command.
 */
export async function handleSlashCommand(
    client: Client,
    interaction: ChatInputCommandInteraction,
): Promise<void> {
    const spec = SPEC_BY_NAME.get(interaction.commandName);
    if (!spec) {
        await interaction.reply({ content: "Unknown command.", ephemeral: true });
        return;
    }

    // Handlers query Mongo before they reply, which routinely outlasts
    // Discord's 3s acknowledgement window. Defer first; the adapter turns the
    // handler's first reply into an edit of this placeholder.
    await interaction.deferReply();

    const { args, users } = buildArgs(interaction, spec);
    const content = `!${spec.name}${args.length ? ` ${args.join(" ")}` : ""}`;
    const { message, replied } = createInteractionMessage(interaction, content, users);

    try {
        // "/" as the prefix so help text renders "/jail" rather than "!jail"
        // for someone who arrived via a slash command.
        await routeMessage(client, message, "/");
    } catch (err: any) {
        console.error(`Slash command /${spec.name} failed:`, err);
        if (!replied()) {
            await interaction
                .editReply("An internal error occurred while processing your command.")
                .catch(() => { });
        }
        return;
    }

    // A handler that returned without replying would leave the deferred reply
    // spinning indefinitely, so close it out rather than leave a dead message.
    if (!replied()) {
        await interaction.deleteReply().catch(() => { });
    }
}
