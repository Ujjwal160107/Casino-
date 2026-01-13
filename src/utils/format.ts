export const fmtCurrency = (amount: number, emoji: string = "🪙") => {
  if (amount >= 2147483647) return `${emoji} ∞`;
  return `${emoji} ${amount.toLocaleString('en-US')}`;
};

export const fmtAmount = (amount: number) => {
  if (amount >= 2147483647) return "∞";
  return amount.toLocaleString('en-US');
};

export const formatDuration = (ms: number): string => {
  const seconds = Math.floor((ms / 1000) % 60);
  const minutes = Math.floor((ms / (1000 * 60)) % 60);
  const hours = Math.floor((ms / (1000 * 60 * 60)) % 24);
  const days = Math.floor(ms / (1000 * 60 * 60 * 24));
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0) parts.push(`${seconds}s`);
  return parts.join(" ") || "0s";
};

export const parseDuration = (input: string): number | null => {
  if (!input) return null;
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
      case 'd': totalSeconds += value * 86400; break;
      case 'h': totalSeconds += value * 3600; break;
      case 'm': totalSeconds += value * 60; break;
      case 's': totalSeconds += value; break;
    }
  }
  return found ? totalSeconds : null;
};

export const parseDurationToDays = (input: string): number | null => {
  const seconds = parseDuration(input);
  if (seconds === null) return null;
  return seconds / 86400;
};

export const parseSmartAmount = (input: string, maxBalance: number = Infinity): number => {
  if (!input) return NaN;
  const lower = input.toLowerCase().replace(/,/g, "");
  if (["all", "max", "allin"].includes(lower)) {
    return maxBalance;
  }
  const suffixMultipliers: {
    [key: string]: number
  } = {
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

export const parseBetAmount = parseSmartAmount;