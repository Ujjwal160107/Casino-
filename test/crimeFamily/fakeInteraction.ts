import { vi } from "vitest";
import { MessageFlags } from "discord.js";
import { fakeRest } from "./fakeClient";

// The slice of a discord.js button, select or modal interaction that the
// crime family router and routes touch. Each ack updates deferred / replied /
// ephemeral the way discord.js does, and logs into `order`.

/** `client` replaces the fake's own client (caper routes pass `fakeCaperClient(...).client`). */
export type FakeOpts = { userId: string; guildId?: string; ephemeralSource?: boolean; channelId?: string; client?: unknown };
type Kind = "button" | "select" | "modal";

const isEphemeral = (options: unknown) =>
  (Number((options as { flags?: unknown } | undefined)?.flags ?? 0) & MessageFlags.Ephemeral) !== 0;

function fakeInteraction(customId: string, kind: Kind, opts: FakeOpts) {
  const order: string[] = [];
  const channel = { isTextBased: () => true };
  const client = {
    user: { id: "bot" },
    options: {},
    rest: fakeRest({ send: async () => ({ id: "m-sent" }), edit: async () => ({}) }),
    channels: { fetch: vi.fn(async (_id: string) => channel) },
    users: { fetch: vi.fn(async (_id: string) => ({ send: vi.fn(async () => ({})) })) },
  };
  const i: any = {
    customId,
    user: { id: opts.userId, username: "FamilyTest", bot: false },
    guildId: opts.guildId ?? "g1",
    channelId: opts.channelId ?? "c1",
    deferred: false,
    replied: false,
    ephemeral: null as boolean | null,
    order,
    client: opts.client ?? client,
    channel,
    message: { id: "m-source", flags: { has: (flag: number) => !!opts.ephemeralSource && flag === MessageFlags.Ephemeral } },
    isButton: () => kind === "button",
    isStringSelectMenu: () => kind === "select",
    isModalSubmit: () => kind === "modal",
    isMessageComponent: () => kind !== "modal",
    isRepliable: () => true,
  };
  i.deferUpdate = vi.fn(async () => { order.push("deferUpdate"); i.deferred = true; });
  i.deferReply = vi.fn(async (o?: unknown) => { order.push("deferReply"); i.deferred = true; i.ephemeral = isEphemeral(o); });
  i.showModal = vi.fn(async (_modal: unknown) => { order.push("showModal"); });
  i.reply = vi.fn(async (o?: unknown) => { order.push("reply"); i.replied = true; i.ephemeral = isEphemeral(o); });
  i.editReply = vi.fn(async (_o?: unknown) => { order.push("editReply"); });
  i.followUp = vi.fn(async (_o?: unknown) => { order.push("followUp"); });
  return i;
}

export function fakeButton(customId: string, opts: FakeOpts) {
  return fakeInteraction(customId, "button", opts);
}

export function fakeSelect(customId: string, values: string[], opts: FakeOpts) {
  const i = fakeInteraction(customId, "select", opts);
  i.values = values;
  return i;
}

export function fakeModal(customId: string, fields: Record<string, string>, opts: FakeOpts) {
  const i = fakeInteraction(customId, "modal", opts);
  i.fields = {
    getTextInputValue: (id: string) => {
      if (!(id in fields)) throw new Error(`No text input ${id}`);
      return fields[id];
    },
  };
  return i;
}

/** Everything the interaction said back: every reply, editReply and followUp payload. */
export function said(i: { reply: { mock: { calls: unknown[] } }; editReply: { mock: { calls: unknown[] } }; followUp: { mock: { calls: unknown[] } } }): string {
  return JSON.stringify([...i.reply.mock.calls, ...i.editReply.mock.calls, ...i.followUp.mock.calls]);
}
