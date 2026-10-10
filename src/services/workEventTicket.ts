import { randomBytes } from "crypto";
import { redisService } from "./redisService";

// A work event shown mid-shift is paid through a one-time ticket: one pending
// event per player, valid only for the player it was shown to, consumed
// atomically by the first choice clicked. Without it the event buttons paid
// anyone who clicked them, any number of times, with no cooldown.
//
// Lives as long as the 300s active-shift lock that guarded the shift.
const TICKET_TTL_SECONDS = 300;
const TICKET_KEY = (userId: string) => `work_event_ticket:${userId}`;

// GET + compare + DEL in one step so two clicks cannot both consume the ticket.
const CLAIM_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return nil end
local ticket = cjson.decode(raw)
if ticket.token ~= ARGV[1] then return nil end
redis.call('DEL', KEYS[1])
return ticket.eventId`;

/** Issues the player's (only) pending event ticket, replacing any older one. Returns its token. */
export async function issueWorkEventTicket(userId: string, eventId: string): Promise<string> {
  const token = randomBytes(6).toString("hex");
  await redisService
    .getInstance()
    .set(TICKET_KEY(userId), JSON.stringify({ token, eventId }), "EX", TICKET_TTL_SECONDS);
  return token;
}

/** Consumes the player's pending ticket if `token` matches. Returns the event id, or null if gone/stale. */
export async function claimWorkEventTicket(userId: string, token: string): Promise<string | null> {
  const eventId = await redisService.getInstance().eval(CLAIM_SCRIPT, 1, TICKET_KEY(userId), token);
  return typeof eventId === "string" ? eventId : null;
}
