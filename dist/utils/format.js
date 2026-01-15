"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseBetAmount = exports.parseSmartAmount = exports.parseDurationToDays = exports.parseDuration = exports.formatDuration = exports.fmtAmount = exports.fmtCurrency = void 0;
const fmtCurrency = (amount, emoji = "🪙") => {
    if (amount >= 2147483647)
        return `${emoji} ∞`;
    return `${emoji} ${amount.toLocaleString('en-US')}`;
};
exports.fmtCurrency = fmtCurrency;
const fmtAmount = (amount) => {
    if (amount >= 2147483647)
        return "∞";
    return amount.toLocaleString('en-US');
};
exports.fmtAmount = fmtAmount;
const formatDuration = (ms) => {
    const seconds = Math.floor((ms / 1000) % 60);
    const minutes = Math.floor((ms / (1000 * 60)) % 60);
    const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));
    const parts = [];
    if (days > 0)
        parts.push(`${days}d`);
    if (hours > 0)
        parts.push(`${hours}h`);
    if (minutes > 0)
        parts.push(`${minutes}m`);
    if (seconds > 0)
        parts.push(`${seconds}s`);
    return parts.join(" ") || "0s";
};
exports.formatDuration = formatDuration;
const parseDuration = (input) => {
    if (!input)
        return null;
    if (/^\d+$/.test(input)) {
        return parseInt(input);
    }
    const regex = /(\d+)\s*(d|h|m|s)/gi;
    let totalSeconds = 0;
    let match;
    let found = false;
    while ((match = regex.exec(input)) !== null) {
        found = true;
        const value = parseInt(match[1]);
        const unit = match[2].toLowerCase();
        switch (unit) {
            case 'd':
                totalSeconds += value * 86400;
                break;
            case 'h':
                totalSeconds += value * 3600;
                break;
            case 'm':
                totalSeconds += value * 60;
                break;
            case 's':
                totalSeconds += value;
                break;
        }
    }
    return found ? totalSeconds : null;
};
exports.parseDuration = parseDuration;
const parseDurationToDays = (input) => {
    const seconds = (0, exports.parseDuration)(input);
    if (seconds === null)
        return null;
    return seconds / 86400;
};
exports.parseDurationToDays = parseDurationToDays;
const parseSmartAmount = (input, maxBalance = Infinity) => {
    if (!input)
        return NaN;
    const lower = input.toLowerCase().replace(/,/g, "");
    if (["all", "max", "allin"].includes(lower)) {
        return maxBalance;
    }
    const suffixMultipliers = {
        'k': 1e3,
        'm': 1e6,
        'b': 1e9
    };
    const suffix = lower[lower.length - 1];
    if (suffixMultipliers[suffix]) {
        const numPart = parseFloat(lower.slice(0, -1));
        return Math.floor(numPart * suffixMultipliers[suffix]);
    }
    return Math.floor(parseFloat(lower));
};
exports.parseSmartAmount = parseSmartAmount;
exports.parseBetAmount = exports.parseSmartAmount;
//# sourceMappingURL=format.js.map