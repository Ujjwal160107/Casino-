// The one eligibility seam (spec 12.1): every found, join, seat, war, racket
// and payday check reads its gate row from ELIGIBILITY_GATES and evaluates it
// here, so a gate is tightened in one table. Never calls Discord.
import { SnowflakeUtil } from "discord.js";
import prisma from "../../utils/prisma";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { caperRole, ELIGIBILITY_GATES, type CaperRoleKey, type GateDef, type GateKey } from "../../data/crimeFamilyCatalog";
import { computeNetWorth } from "../netWorthService";
import { isBanActive } from "../banService";
import { checkJailStatus } from "../jailService";
import { getOwnedPrepKeys } from "../crimeService";
import { ACTIVITY_RULES } from "./extensions";
import { FamilyError } from "./tx";

export type EligibilityCheck = { gate: string; need: string; have: string; ok: boolean };
export type EligibilityResult = { ok: boolean; checks: EligibilityCheck[]; failures: EligibilityCheck[] };
export interface EligibilityOpts { now?: Date; guildId?: string | null; expectedGuildId?: string; familyId?: string; role?: CaperRoleKey }

type ExitReason = "LEFT" | "KICKED" | "DISBANDED";

const DAY_MS = 86_400_000;
const ACTIVE_WINDOW_MS = 7 * DAY_MS;

const num = (n: number) => Math.floor(n).toLocaleString("en-US");
const days = (ms: number) => `${num(Math.max(0, ms) / DAY_MS)} days`;
const unix = (d: Date) => `<t:${Math.floor(d.getTime() / 1000)}:R>`;

/** When the Discord account was created; an id that is not a snowflake counts as brand new. */
export function discordAccountCreatedAt(uid: string): Date {
  if (!/^\d{17,20}$/.test(uid)) return new Date();
  return new Date(SnowflakeUtil.timestampFrom(uid));
}

/** When a member who exited may join or found again (6.6). A disbanding Boss's longer founding wait is refound_cooldown. */
export function hopCooldownEndsAt(exit: { reason: ExitReason; leftAt: Date }): Date {
  return new Date(exit.leftAt.getTime() + CRIME_FAMILY_CONFIG.hopCooldownSeconds[exit.reason] * 1000);
}

/** Active for payday and rackets (7.3): any ACTIVITY_RULES entry met in the last 7 days. */
export async function isActiveMember(uid: string, now: Date): Promise<{ active: boolean; have: string; need: string }> {
  if (ACTIVITY_RULES.length === 0) return { active: false, have: "0", need: "recent caper or war play" };
  const since = new Date(now.getTime() - ACTIVE_WINDOW_MS);
  const counts = await Promise.all(ACTIVITY_RULES.map((r) => r.count(uid, since)));
  return {
    active: ACTIVITY_RULES.some((r, i) => counts[i] >= r.need),
    have: ACTIVITY_RULES.map((r, i) => `${num(counts[i])} ${r.label}`).join(", "),
    need: `${ACTIVITY_RULES.map((r) => `≥ ${num(r.need)} ${r.label}`).join(" or ")} in 7 days`,
  };
}

/** The player-facing refusal for failed checks: "Not eligible: ≥ 60 shifts (you have 59 shifts); …". */
export function eligibilityError(failures: EligibilityCheck[]): FamilyError {
  return new FamilyError(`Not eligible: ${failures.map((f) => `${f.need} (you have ${f.have})`).join("; ")}`);
}

function guildPhrase(gate: GateDef): string {
  return gate.guild === "home" ? "acting in the family's home server" : "acting in the lobby's server";
}

/**
 * Evaluates every row of the gate, in a fixed order: banned, jailed,
 * discord_age, fortuna_age, shifts, net_worth, not_member | tenure, heat,
 * in_family, hop_cooldown, refound_cooldown, rejoin_cooldown, guild,
 * prep_item, active.
 */
export async function checkMemberEligibility(uid: string, gateKey: GateKey, opts: EligibilityOpts = {}): Promise<EligibilityResult> {
  const gate = ELIGIBILITY_GATES[gateKey];
  const now = opts.now ?? new Date();
  const checks: EligibilityCheck[] = [];
  const add = (name: string, ok: boolean, need: string, have: string) => checks.push({ gate: name, need, have, ok });

  const [user, member] = await Promise.all([
    prisma.user.findUnique({
      where: { discordId: uid },
      select: { isBanned: true, banExpiresAt: true, createdAt: true, shiftsWorked: true, crimeHeat: true },
    }),
    prisma.familyMember.findUnique({ where: { userId: uid }, select: { joinedAt: true } }),
  ]);
  const heat = user?.crimeHeat ?? 0;
  const shifts = user?.shiftsWorked ?? 0;

  const banned = isBanActive(user, now);
  add("banned", !banned, "not banned", banned ? "banned" : "not banned");

  if (gate.notJailed) {
    const { isJailed } = await checkJailStatus(uid);
    add("jailed", !isJailed, "not jailed", isJailed ? "jailed" : "not jailed");
  }

  const discordAgeMs = now.getTime() - discordAccountCreatedAt(uid).getTime();
  add("discord_age", discordAgeMs >= gate.discordAgeDays * DAY_MS, `≥ ${num(gate.discordAgeDays)} days Discord age`, days(discordAgeMs));

  if (gate.fortunaAgeDays !== null) {
    const fortunaAgeMs = now.getTime() - (user?.createdAt ?? now).getTime();
    add("fortuna_age", fortunaAgeMs >= gate.fortunaAgeDays * DAY_MS, `≥ ${num(gate.fortunaAgeDays)} days Fortuna age`, days(fortunaAgeMs));
  }

  add("shifts", shifts >= gate.shifts, `≥ ${num(gate.shifts)} shifts`, `${num(shifts)} shifts`);

  if (gate.netWorth !== null) {
    const { total } = await computeNetWorth(uid);
    add("net_worth", total >= gate.netWorth, `≥ ${num(gate.netWorth)} net worth`, num(total));
  }

  if (gate.tenureSeconds !== null) {
    const need = `≥ ${num(gate.tenureSeconds / 86_400)} days in the family`;
    if (!member) add("not_member", false, "a member of a family", "no family");
    else {
      const tenureMs = now.getTime() - member.joinedAt.getTime();
      add("tenure", tenureMs >= gate.tenureSeconds * 1000, need, days(tenureMs));
    }
  }

  if (gate.heatBelow !== null) add("heat", heat < gate.heatBelow, `heat below ${num(gate.heatBelow)}`, `heat ${num(heat)}`);

  if (gate.notInFamily) add("in_family", !member, "not in a family", member ? "a family" : "no family");

  if (gate.hop) {
    const latest = await prisma.familyExit.findFirst({ where: { userId: uid }, orderBy: { leftAt: "desc" } });
    const hopEnds = latest ? hopCooldownEndsAt({ reason: latest.reason as ExitReason, leftAt: latest.leftAt }) : null;
    const hopOk = !hopEnds || hopEnds <= now;
    add("hop_cooldown", hopOk, "no recent family exit", hopOk ? "none" : `a cooldown that ends ${unix(hopEnds!)}`);

    if (gate.hop === "found") {
      const windowMs = CRIME_FAMILY_CONFIG.refoundAfterBossDisbandSeconds * 1000;
      const disbanded = await prisma.familyExit.findFirst({
        where: { userId: uid, reason: "DISBANDED", wasBoss: true, leftAt: { gt: new Date(now.getTime() - windowMs) } },
        orderBy: { leftAt: "desc" },
      });
      add("refound_cooldown", !disbanded, `≥ ${num(windowMs / DAY_MS)} days since you disbanded a family`,
        disbanded ? `a cooldown that ends ${unix(new Date(disbanded.leftAt.getTime() + windowMs))}` : "none");
    }

    if (opts.familyId) {
      const windowMs = CRIME_FAMILY_CONFIG.rejoinSameFamilySeconds * 1000;
      const left = await prisma.familyExit.findFirst({
        where: { userId: uid, familyId: opts.familyId, leftAt: { gt: new Date(now.getTime() - windowMs) } },
        orderBy: { leftAt: "desc" },
      });
      add("rejoin_cooldown", !left, `≥ ${num(windowMs / DAY_MS)} days since you left this family`,
        left ? `a cooldown that ends ${unix(new Date(left.leftAt.getTime() + windowMs))}` : "none");
    }
  }

  if (gate.guild && opts.expectedGuildId !== undefined) {
    const same = opts.guildId === opts.expectedGuildId;
    add("guild", same, guildPhrase(gate), same ? "this server" : "another server");
  }

  if (gate.prepItem && opts.role) {
    const role = caperRole(opts.role);
    const owned = await getOwnedPrepKeys(uid);
    const has = role.prepKeys.some((k) => owned.has(k));
    add("prep_item", has, `a ${role.name} prep item`, has ? "one" : "none");
  }

  if (gate.activeMember) {
    const { active, have, need } = await isActiveMember(uid, now);
    add("active", active, need, have);
  }

  const failures = checks.filter((c) => !c.ok);
  return { ok: failures.length === 0, checks, failures };
}
