import { TESTER_IDS, BOT_DEVELOPER_IDS } from "./developerAccess";

const cooldowns = new Map<string, number>();
const dynamicCooldowns = new Map<string, number>(); // Stores lastUsed timestamp

function testerKeyBypass(key: string) {
  for (const developerId of BOT_DEVELOPER_IDS) {
    if (key.includes(developerId)) return true;
  }
  for (const testerId of TESTER_IDS) {
    if (key.includes(testerId)) return true;
  }
  return false;
}

export function checkCooldown(key: string, seconds: number): number {
  if (testerKeyBypass(key)) return 0;
  const now = Date.now();
  const expiresAt = cooldowns.get(key) ?? 0;
  if (now < expiresAt) {
    return Math.ceil((expiresAt - now) / 1000);
  }
  cooldowns.set(key, now + seconds * 1000);
  return 0;
}

export function checkDynamicCooldown(key: string, durationSeconds: number): number {
  if (testerKeyBypass(key)) return 0;
  const now = Date.now();
  const lastUsed = dynamicCooldowns.get(key) ?? 0;
  // If duration changed, this calculation adapts immediately
  const expiresAt = lastUsed + (durationSeconds * 1000);

  if (now < expiresAt) {
    return Math.ceil((expiresAt - now) / 1000);
  }

  // Update lastUsed
  dynamicCooldowns.set(key, now);
  return 0;
}

export function setCooldown(key: string, secondsFromNow: number) {
  if (testerKeyBypass(key)) return;
  cooldowns.set(key, Date.now() + secondsFromNow * 1000);
}

export function clearCooldown(key: string) {
  cooldowns.delete(key);
  dynamicCooldowns.delete(key);
}

export function getCooldownExpiry(key: string): number | null {
  const expiresAt = cooldowns.get(key);
  if (!expiresAt || expiresAt <= Date.now()) return null;
  return expiresAt;
}

// Helper to get expiry for dynamic cooldowns without updating
export function getDynamicCooldownExpiry(key: string, durationSeconds: number): number | null {
  const lastUsed = dynamicCooldowns.get(key);
  if (!lastUsed) return null;
  const expiresAt = lastUsed + (durationSeconds * 1000);
  if (expiresAt <= Date.now()) return null;
  return expiresAt;
}
