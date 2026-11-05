import { vi } from "vitest";
import { fakeDmClient } from "../dm/helpers";

export type FakeCall = { op: "send" | "edit"; channelId: string; messageId?: string; payload: any };

/**
 * A fake Discord client: every channel exists (unless `dead`) and accepts
 * sends and edits; users accept DMs. `failSend`/`failEdit` hold channel ids
 * whose sends or edits throw Missing Permissions (50013). Every attempt is
 * pushed to `calls` before it throws, so a failed send still counts.
 */
export function fakeClient(o: { dead?: boolean; failSend?: Set<string>; failEdit?: Set<string> } = {}) {
  const dm = fakeDmClient();
  const sent: any[] = []; const edits: [string, any][] = []; const calls: FakeCall[] = [];
  const denied = () => Object.assign(new Error("Missing Permissions"), { code: 50013 });
  const channelFor = (channelId: string) => ({
    isTextBased: () => true,
    send: vi.fn(async (p: any) => {
      calls.push({ op: "send", channelId, payload: p });
      if (o.failSend?.has(channelId)) throw denied();
      sent.push(p);
      return { id: `m${sent.length}` };
    }),
    messages: {
      edit: vi.fn(async (id: string, p: any) => {
        calls.push({ op: "edit", channelId, messageId: id, payload: p });
        if (o.failEdit?.has(channelId)) throw denied();
        edits.push([id, p]);
        return {};
      }),
    },
  });
  (dm.client as any).channels = {
    fetch: vi.fn(async (channelId: string) => {
      if (o.dead) throw Object.assign(new Error("Unknown Channel"), { code: 10003 });
      return channelFor(channelId);
    }),
  };
  return { client: dm.client, dm: dm.sent, sent, edits, calls };
}
