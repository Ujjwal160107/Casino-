// Member activity (spec 14.3): `lastActiveAt` drives succession, so every
// family press touches it, throttled to one write per member per hour by a
// Redis SET NX. Redis never guards money or uniqueness here, so an outage
// writes anyway instead of skipping.
import prisma from "../../utils/prisma";
import { redisService } from "../redisService";
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";

export type SetNxResult = "set" | "held" | "error";

/**
 * Tri-state SET NX EX. Unlike redisService.setIfNotExists (fails closed),
 * callers see "error" and decide; every Crime Families caller fails open.
 */
export async function setNx(key: string, ttlSeconds: number): Promise<SetNxResult> {
  try {
    const res = await redisService.getInstance().set(key, "1", "EX", ttlSeconds, "NX");
    return res === "OK" ? "set" : "held";
  } catch (err) {
    console.error(`[crimeFamily] setNx error for ${key}:`, err);
    return "error";
  }
}

/** Deletes a setNx key early. Never throws: a Redis error leaves the key to its TTL. */
export async function clearKey(key: string): Promise<void> {
  try {
    await redisService.getInstance().del(key);
  } catch (err) {
    console.error(`[crimeFamily] clearKey error for ${key}:`, err);
  }
}

/** Records that a member acted now, at most once per activityThrottleSeconds. Never throws. */
export async function touchActivity(uid: string, now: Date = new Date()): Promise<void> {
  try {
    if ((await setNx(`cf:active:${uid}`, CRIME_FAMILY_CONFIG.activityThrottleSeconds)) === "held") return;
    await prisma.familyMember.updateMany({ where: { userId: uid }, data: { lastActiveAt: now } });
  } catch (err) {
    console.error(`[crimeFamily] touchActivity error for ${uid}:`, err);
  }
}
