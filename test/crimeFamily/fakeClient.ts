import { vi } from "vitest";
import { fakeDmClient } from "../dm/helpers";

export type FakeCall = { op: "send" | "edit"; channelId: string; messageId?: string; payload: any };

type RestOptions = { body?: Record<string, unknown>; files?: unknown[] };

/**
 * A `client.rest` double for the REST seam (F15): `post` on
 * `/channels/<id>/messages` calls `send`, `patch` on
 * `/channels/<id>/messages/<mid>` calls `edit`. The payload handed on is the
 * REST body JSON plus `files`, so components are already JSON and mentions
 * read `allowed_mentions`.
 */
export function fakeRest(h: {
  send(channelId: string, payload: any): Promise<{ id: string }>;
  edit(channelId: string, messageId: string, payload: any): Promise<unknown>;
}) {
  const parts = (route: string) => route.split("/").filter(Boolean);   // ["channels", id, "messages", mid?]
  return {
    post: vi.fn(async (route: string, o: RestOptions = {}) => h.send(parts(route)[1], { ...o.body, files: o.files })),
    patch: vi.fn(async (route: string, o: RestOptions = {}) => {
      const [, channelId, , messageId] = parts(route);
      return h.edit(channelId, messageId, { ...o.body, files: o.files });
    }),
  };
}

/**
 * A fake Discord client: every channel exists (unless `dead`, Unknown Channel
 * 10003) and accepts sends and edits through `rest`; users accept DMs.
 * `failSend`/`failEdit` hold channel ids whose sends or edits throw Missing
 * Permissions (50013). Every attempt on a live channel is pushed to `calls`
 * before it throws, so a failed send still counts.
 */
export function fakeClient(o: { dead?: boolean; failSend?: Set<string>; failEdit?: Set<string> } = {}) {
  const dm = fakeDmClient();
  const sent: any[] = []; const edits: [string, any][] = []; const calls: FakeCall[] = [];
  const denied = () => Object.assign(new Error("Missing Permissions"), { code: 50013 });
  const unknownChannel = () => Object.assign(new Error("Unknown Channel"), { code: 10003 });
  (dm.client as any).options = {};
  (dm.client as any).rest = fakeRest({
    send: async (channelId, p) => {
      if (o.dead) throw unknownChannel();
      calls.push({ op: "send", channelId, payload: p });
      if (o.failSend?.has(channelId)) throw denied();
      sent.push(p);
      return { id: `m${sent.length}` };
    },
    edit: async (channelId, id, p) => {
      if (o.dead) throw unknownChannel();
      calls.push({ op: "edit", channelId, messageId: id, payload: p });
      if (o.failEdit?.has(channelId)) throw denied();
      edits.push([id, p]);
      return {};
    },
  });
  (dm.client as any).channels = {
    fetch: vi.fn(async (channelId: string) => {
      if (o.dead) throw unknownChannel();
      return { id: channelId, isTextBased: () => true };
    }),
  };
  return { client: dm.client, dm: dm.sent, sent, edits, calls };
}
