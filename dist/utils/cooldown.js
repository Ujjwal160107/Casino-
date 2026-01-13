"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkCooldown = checkCooldown;
exports.checkDynamicCooldown = checkDynamicCooldown;
exports.setCooldown = setCooldown;
exports.clearCooldown = clearCooldown;
exports.getCooldownExpiry = getCooldownExpiry;
exports.getDynamicCooldownExpiry = getDynamicCooldownExpiry;
const cooldowns = new Map();
const dynamicCooldowns = new Map(); // Stores lastUsed timestamp
function checkCooldown(key, seconds) {
    const now = Date.now();
    const expiresAt = cooldowns.get(key) ?? 0;
    if (now < expiresAt) {
        return Math.ceil((expiresAt - now) / 1000);
    }
    cooldowns.set(key, now + seconds * 1000);
    return 0;
}
function checkDynamicCooldown(key, durationSeconds) {
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
function setCooldown(key, secondsFromNow) {
    cooldowns.set(key, Date.now() + secondsFromNow * 1000);
}
function clearCooldown(key) {
    cooldowns.delete(key);
    dynamicCooldowns.delete(key);
}
function getCooldownExpiry(key) {
    const expiresAt = cooldowns.get(key);
    if (!expiresAt || expiresAt <= Date.now())
        return null;
    return expiresAt;
}
// Helper to get expiry for dynamic cooldowns without updating
function getDynamicCooldownExpiry(key, durationSeconds) {
    const lastUsed = dynamicCooldowns.get(key);
    if (!lastUsed)
        return null;
    const expiresAt = lastUsed + (durationSeconds * 1000);
    if (expiresAt <= Date.now())
        return null;
    return expiresAt;
}
//# sourceMappingURL=cooldown.js.map