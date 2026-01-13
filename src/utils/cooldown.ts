const cooldowns = new Map<string, number>();
const dynamicCooldowns = new Map<string, number>(); // Stores lastUsed timestamp

export function checkCooldown(key: string, seconds: number): number {
  const now = Date.now();
  const expiresAt = cooldowns.get(key) ?? 0;
  if (now < expiresAt) {
    return Math.ceil((expiresAt - now) / 1000);
  }
  cooldowns.set(key, now + seconds * 1000);
  return 0;
}

export function checkDynamicCooldown(key: string, durationSeconds: number): number {
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