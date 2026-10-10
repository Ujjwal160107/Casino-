import {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ComponentType,
    InteractionCollector,
    InteractionType,
    Message,
    ModalBuilder,
    ModalSubmitInteraction,
    TextInputBuilder,
    TextInputStyle,
} from "discord.js";

// Typed minigames collect the answer through a modal. Reading a chat reply
// needs the Message Content intent, which Discord denied, so a typed message
// reaches the bot with empty content and the player could never win.
export const TYPED_ANSWER_BUTTON_ID = "typed_answer:open";
export const TYPED_ANSWER_MODAL_ID = "typed_answer:submit";
const INPUT_ID = "answer";

export function typedAnswerRow() {
    return new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setCustomId(TYPED_ANSWER_BUTTON_ID)
            .setLabel("Answer")
            .setStyle(ButtonStyle.Primary),
    );
}

function answerModal() {
    return new ModalBuilder()
        .setCustomId(TYPED_ANSWER_MODAL_ID)
        .setTitle("Your answer")
        .addComponents(
            new ActionRowBuilder<TextInputBuilder>().addComponents(
                new TextInputBuilder()
                    .setCustomId(INPUT_ID)
                    .setLabel("Answer")
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true),
            ),
        );
}

/**
 * Waits for `userId` to answer through the modal behind `reply`'s Answer
 * button. Resolves to the trimmed answer, or null once `timeMs` runs out.
 *
 * Every click reopens the modal: Discord sends no event when a modal is
 * dismissed, so a player who closes it by accident can still answer in time.
 */
export async function awaitTypedAnswer(reply: Message, userId: string, timeMs: number): Promise<string | null> {
    const clicks = new InteractionCollector<ButtonInteraction>(reply.client, {
        message: reply,
        interactionType: InteractionType.MessageComponent,
        componentType: ComponentType.Button,
        filter: (i) => i.customId === TYPED_ANSWER_BUTTON_ID && i.user.id === userId,
        time: timeMs,
    });
    clicks.on("collect", (i) => { i.showModal(answerModal()).catch(() => { }); });

    const submits = new InteractionCollector<ModalSubmitInteraction>(reply.client, {
        message: reply,
        interactionType: InteractionType.ModalSubmit,
        filter: (i) => i.customId === TYPED_ANSWER_MODAL_ID && i.user.id === userId,
        max: 1,
        time: timeMs,
    });

    const submitted = await new Promise<ModalSubmitInteraction | undefined>((resolve) =>
        submits.once("end", (collected) => resolve(collected.first())),
    );
    clicks.stop();

    if (!submitted) return null;
    await submitted.deferUpdate().catch(() => { });
    return submitted.fields.getTextInputValue(INPUT_ID).trim();
}
