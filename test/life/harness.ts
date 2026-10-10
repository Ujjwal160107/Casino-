// A stand-in for a discord.js ButtonInteraction that is good enough for the
// real interactionHelpers (safeReply/safeUpdate/defer*) to drive. Every reply
// is recorded so tests can assert what the player was shown.
export function fakeButton(customId: string, userId: string) {
  const calls: { method: string; payload: unknown }[] = [];
  const record = (method: string) => async (payload?: unknown) => {
    calls.push({ method, payload });
    return {};
  };
  const interaction: any = {
    customId,
    user: { id: userId, username: `user-${userId}`, tag: `user-${userId}#0`, displayAvatarURL: () => "https://example.invalid/a.png" },
    guild: { id: "g-life" },
    guildId: "g-life",
    member: null,
    client: {},
    channel: null,
    deferred: false,
    replied: false,
    isButton: () => true,
    isStringSelectMenu: () => false,
    reply: async (p: unknown) => { interaction.replied = true; return record("reply")(p); },
    update: async (p: unknown) => { interaction.replied = true; return record("update")(p); },
    deferUpdate: async () => { interaction.deferred = true; return record("deferUpdate")(); },
    deferReply: async (p: unknown) => { interaction.deferred = true; return record("deferReply")(p); },
    editReply: record("editReply"),
    followUp: record("followUp"),
    deleteReply: record("deleteReply"),
    fetchReply: async () => ({}),
  };
  return { interaction, calls, shown: () => JSON.stringify(calls) };
}
