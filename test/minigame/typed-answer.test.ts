import { describe, it, expect, vi } from "vitest";
import { EventEmitter } from "node:events";
import { ComponentType, Events, InteractionType } from "discord.js";
import { awaitTypedAnswer, TYPED_ANSWER_BUTTON_ID, TYPED_ANSWER_MODAL_ID } from "../../src/utils/typedAnswer";

function fakeReply() {
  const client = Object.assign(new EventEmitter(), {
    incrementMaxListeners: () => { },
    decrementMaxListeners: () => { },
  });
  return { id: "msg-1", channelId: "chan-1", guildId: "guild-1", client } as any;
}

let nextId = 0;
// The fields InteractionCollector matches an interaction against its message on.
const routing = (reply: any) => ({
  id: String(++nextId),
  message: { id: reply.id },
  channelId: reply.channelId,
  guildId: reply.guildId,
});

function click(reply: any, userId: string) {
  const interaction = {
    type: InteractionType.MessageComponent,
    componentType: ComponentType.Button,
    customId: TYPED_ANSWER_BUTTON_ID,
    ...routing(reply),
    user: { id: userId },
    showModal: vi.fn(async () => { }),
  };
  reply.client.emit(Events.InteractionCreate, interaction);
  return interaction;
}

function submit(reply: any, userId: string, answer: string) {
  const interaction = {
    type: InteractionType.ModalSubmit,
    customId: TYPED_ANSWER_MODAL_ID,
    ...routing(reply),
    user: { id: userId },
    fields: { getTextInputValue: () => answer },
    deferUpdate: vi.fn(async () => { }),
  };
  reply.client.emit(Events.InteractionCreate, interaction);
  return interaction;
}

const tick = () => new Promise((r) => setImmediate(r));

describe("awaitTypedAnswer", () => {
  it("opens the modal on click and resolves to the submitted answer", async () => {
    const reply = fakeReply();
    const pending = awaitTypedAnswer(reply, "player", 5_000);

    const button = click(reply, "player");
    await tick();
    expect(button.showModal).toHaveBeenCalledOnce();

    const modal = submit(reply, "player", "  AX-42  ");
    await expect(pending).resolves.toBe("AX-42");
    expect(modal.deferUpdate).toHaveBeenCalledOnce();
  });

  it("ignores clicks and submissions from other users", async () => {
    const reply = fakeReply();
    const pending = awaitTypedAnswer(reply, "player", 5_000);

    const button = click(reply, "someone-else");
    submit(reply, "someone-else", "wrong");
    await tick();
    expect(button.showModal).not.toHaveBeenCalled();

    submit(reply, "player", "right");
    await expect(pending).resolves.toBe("right");
  });

  it("lets the player reopen the modal after dismissing it", async () => {
    const reply = fakeReply();
    const pending = awaitTypedAnswer(reply, "player", 5_000);

    const first = click(reply, "player");
    const second = click(reply, "player");
    await tick();
    expect(first.showModal).toHaveBeenCalledOnce();
    expect(second.showModal).toHaveBeenCalledOnce();

    submit(reply, "player", "done");
    await expect(pending).resolves.toBe("done");
  });

  it("resolves to null when time runs out", async () => {
    const reply = fakeReply();
    await expect(awaitTypedAnswer(reply, "player", 30)).resolves.toBeNull();
    expect(reply.client.listenerCount(Events.InteractionCreate)).toBe(0);
  });
});
