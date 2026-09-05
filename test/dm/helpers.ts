import { Client, ComponentType, ContainerBuilder } from "discord.js";

/** All TextDisplay content in a container, top-level and inside sections, joined by newlines. */
export function containerText(container: ContainerBuilder): string {
  const json = container.toJSON() as any;
  const parts: string[] = [];
  for (const c of json.components) {
    if (c.type === ComponentType.TextDisplay) parts.push(c.content);
    if (c.type === ComponentType.Section) for (const t of c.components) parts.push(t.content);
  }
  return parts.join("\n");
}

/** URL of the first section's thumbnail accessory, if any. */
export function containerThumb(container: ContainerBuilder): string | undefined {
  const json = container.toJSON() as any;
  return json.components[0]?.accessory?.media?.url;
}

export type FakeDm = { client: Client; sent: Map<string, number> };

/** A client whose users all exist. Ids in `failFor` reject send, like closed DMs (50007). */
export function fakeDmClient(failFor: string[] = []): FakeDm {
  const sent = new Map<string, number>();
  const client = {
    users: {
      fetch: async (id: string) => ({
        send: async () => {
          if (failFor.includes(id)) {
            throw Object.assign(new Error("Cannot send messages to this user"), { code: 50007 });
          }
          sent.set(id, (sent.get(id) ?? 0) + 1);
          return {};
        },
      }),
    },
  } as unknown as Client;
  return { client, sent };
}
