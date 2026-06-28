import prisma from "../../utils/prisma";
import { globalCatalogGuildFilter } from "../../utils/globalCatalog";
import { ensureUserAndWallet } from "../walletService";
import { isTester } from "../../utils/developerAccess";

export const MAX_AFFECTION = 1000;

export type MarriageAction = "hug" | "kiss" | "make_love" | "date" | "chaos";

export type AffectionTier = {
  name: string;
  min: number;
  max: number | null;
  multiplier: number;
};

export const AFFECTION_TIERS: AffectionTier[] = [
  { name: "Cold Roommates", min: 0, max: 99, multiplier: 1 },
  { name: "Flirty Partners", min: 100, max: 249, multiplier: 1.05 },
  { name: "Sweethearts", min: 250, max: 499, multiplier: 1.1 },
  { name: "Power Couple", min: 500, max: 799, multiplier: 1.15 },
  { name: "Obsessed Lovers", min: 800, max: null, multiplier: 1.25 },
];

const ACTION_CONFIG: Record<Exclude<MarriageAction, "chaos">, {
  field: "lastHugAt" | "lastKissAt" | "lastMakeLoveAt" | "lastDateAt";
  cooldownMs: number;
  affection: [number, number];
  reward: [number, number];
  cost?: number;
}> = {
  hug: {
    field: "lastHugAt",
    cooldownMs: 2 * 60 * 60 * 1000,
    affection: [12, 20],
    reward: [3_000, 8_000],
  },
  kiss: {
    field: "lastKissAt",
    cooldownMs: 4 * 60 * 60 * 1000,
    affection: [25, 38],
    reward: [7_500, 16_000],
  },
  make_love: {
    field: "lastMakeLoveAt",
    cooldownMs: 24 * 60 * 60 * 1000,
    affection: [75, 110],
    reward: [25_000, 55_000],
  },
  date: {
    field: "lastDateAt",
    cooldownMs: 20 * 60 * 60 * 1000,
    affection: [45, 70],
    reward: [30_000, 80_000],
    cost: 75_000,
  },
};

const CHAOS_COOLDOWN_MS = 24 * 60 * 60 * 1000;
const DECAY_START_DAYS = 3;
const AT_RISK_DAYS = 7;
const AUTO_DIVORCE_DAYS = 10;

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function daysBetween(from: Date, to: Date) {
  return Math.floor((to.getTime() - from.getTime()) / (24 * 60 * 60 * 1000));
}

function sameUtcDay(a: Date, b: Date) {
  return a.getUTCFullYear() === b.getUTCFullYear()
    && a.getUTCMonth() === b.getUTCMonth()
    && a.getUTCDate() === b.getUTCDate();
}

export function getAffectionTier(affection: number): AffectionTier {
  return AFFECTION_TIERS.find((tier) => affection >= tier.min && (tier.max === null || affection <= tier.max))
    ?? AFFECTION_TIERS[0];
}

export function getSpouseId(marriage: { spouse1Id: string; spouse2Id: string }, discordId: string) {
  return marriage.spouse1Id === discordId ? marriage.spouse2Id : marriage.spouse1Id;
}

export async function getMarriage(discordId: string) {
  return prisma.marriage.findFirst({
    where: {
      OR: [{ spouse1Id: discordId }, { spouse2Id: discordId }],
    },
    include: {
      spouse1: true,
      spouse2: true,
      vaultRequests: {
        where: { status: "PENDING" },
        orderBy: { createdAt: "desc" },
        take: 3,
      },
    },
  });
}

export async function isMarried(discordId: string): Promise<boolean> {
  return !!(await getMarriage(discordId));
}

export async function checkHasRing(discordId: string, _guildId: string): Promise<boolean> {
  const ring = await prisma.shopItem.findFirst({
    where: globalCatalogGuildFilter({
      name: { equals: "Ring", mode: "insensitive" },
    }),
  });
  if (!ring) return true;

  const inventoryItem = await prisma.inventory.findUnique({
    where: {
      userId_shopItemId: {
        userId: discordId,
        shopItemId: ring.id,
      },
    },
  });
  return !!inventoryItem && inventoryItem.amount > 0;
}

export async function consumeRing(discordId: string, _guildId: string) {
  const ring = await prisma.shopItem.findFirst({
    where: globalCatalogGuildFilter({
      name: { equals: "Ring", mode: "insensitive" },
    }),
  });
  if (!ring) return false;

  const inventoryItem = await prisma.inventory.findUnique({
    where: {
      userId_shopItemId: {
        userId: discordId,
        shopItemId: ring.id,
      },
    },
  });
  if (!inventoryItem || inventoryItem.amount <= 0) return false;

  if (inventoryItem.amount > 1) {
    await prisma.inventory.update({
      where: { id: inventoryItem.id },
      data: { amount: { decrement: 1 } },
    });
  } else {
    await prisma.inventory.delete({ where: { id: inventoryItem.id } });
  }
  return true;
}

export async function marry(discordId1: string, username1: string, discordId2: string, username2: string, guildId: string) {
  await ensureUserAndWallet(discordId1, guildId, username1);
  await ensureUserAndWallet(discordId2, guildId, username2);

  const existing = await prisma.marriage.findFirst({
    where: {
      OR: [
        { spouse1Id: discordId1 },
        { spouse2Id: discordId1 },
        { spouse1Id: discordId2 },
        { spouse2Id: discordId2 },
      ],
    },
  });
  if (existing) throw new Error("One of you is already married.");

  return prisma.marriage.create({
    data: {
      spouse1Id: discordId1,
      spouse2Id: discordId2,
      affection: 25,
      lastAffectionActionAt: new Date(),
      lastDrama: "The proposal landed. The room went suspiciously quiet, then very warm.",
    },
    include: { spouse1: true, spouse2: true },
  });
}

export async function divorce(discordId: string, reason = "manual") {
  const marriage = await getMarriage(discordId);
  if (!marriage) throw new Error("You are not married.");

  const spouseA = marriage.spouse1Id;
  const spouseB = marriage.spouse2Id;
  const firstShare = Math.floor(marriage.jointBalance / 2);
  const secondShare = Math.floor(marriage.jointBalance - firstShare);
  const now = new Date();

  await ensureUserAndWallet(spouseA, "global", marriage.spouse1.username);
  await ensureUserAndWallet(spouseB, "global", marriage.spouse2.username);

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { discordId: { in: [spouseA, spouseB] } },
      data: { lastDivorcedAt: now },
    });

    if (firstShare > 0) {
      await tx.wallet.update({ where: { userId: spouseA }, data: { balance: { increment: firstShare } } });
      const wallet = await tx.wallet.findUnique({ where: { userId: spouseA } });
      if (wallet) {
        await tx.transaction.create({
          data: { walletId: wallet.id, amount: firstShare, type: "marriage_vault_split", meta: { reason, marriageId: marriage.id }, isEarned: false },
        });
      }
    }

    if (secondShare > 0) {
      await tx.wallet.update({ where: { userId: spouseB }, data: { balance: { increment: secondShare } } });
      const wallet = await tx.wallet.findUnique({ where: { userId: spouseB } });
      if (wallet) {
        await tx.transaction.create({
          data: { walletId: wallet.id, amount: secondShare, type: "marriage_vault_split", meta: { reason, marriageId: marriage.id }, isEarned: false },
        });
      }
    }

    await tx.marriage.delete({ where: { id: marriage.id } });
  });

  return { spouseA, spouseB, firstShare, secondShare, reason };
}

export async function depositToJoint(discordId: string, amount: number) {
  const marriage = await getMarriage(discordId);
  if (!marriage) throw new Error("You are not married.");
  if (amount <= 0) throw new Error("Amount must be positive.");

  const wallet = await prisma.wallet.findUnique({ where: { userId: discordId } });
  if (!wallet || wallet.balance < amount) throw new Error("Insufficient funds in your wallet.");

  const updated = await prisma.$transaction(async (tx) => {
    await tx.wallet.update({
      where: { userId: discordId },
      data: { balance: { decrement: amount } },
    });
    await tx.transaction.create({
      data: { walletId: wallet.id, amount: -amount, type: "marriage_vault_deposit", meta: { marriageId: marriage.id }, isEarned: false },
    });
    return tx.marriage.update({
      where: { id: marriage.id },
      data: {
        jointBalance: { increment: amount },
        lastDrama: "Someone fed the Couple Vault. Responsible romance, somehow.",
      },
    });
  });

  return updated.jointBalance;
}

export async function createVaultWithdrawRequest(discordId: string, amount: number) {
  const marriage = await getMarriage(discordId);
  if (!marriage) throw new Error("You are not married.");
  if (amount <= 0) throw new Error("Amount must be positive.");
  if (marriage.jointBalance < amount) throw new Error("The Couple Vault does not have that much.");

  const spouseId = getSpouseId(marriage, discordId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 10 * 60 * 1000);

  await prisma.marriageVaultRequest.updateMany({
    where: {
      marriageId: marriage.id,
      requesterId: discordId,
      status: "PENDING",
    },
    data: { status: "EXPIRED", resolvedAt: now },
  });

  return prisma.marriageVaultRequest.create({
    data: {
      marriageId: marriage.id,
      requesterId: discordId,
      spouseId,
      amount,
      expiresAt,
    },
  });
}

export async function resolveVaultWithdrawRequest(requestId: string, resolverId: string, approve: boolean) {
  const request = await prisma.marriageVaultRequest.findUnique({
    where: { id: requestId },
    include: { marriage: true },
  });
  if (!request) throw new Error("Withdrawal request not found.");
  if (request.spouseId !== resolverId) throw new Error("Only the spouse can resolve this request.");
  if (request.status !== "PENDING") throw new Error("This request is no longer pending.");

  const now = new Date();
  if (request.expiresAt.getTime() <= now.getTime()) {
    await prisma.marriageVaultRequest.update({
      where: { id: request.id },
      data: { status: "EXPIRED", resolvedAt: now },
    });
    throw new Error("This withdrawal request expired.");
  }

  if (!approve) {
    const updated = await prisma.marriageVaultRequest.update({
      where: { id: request.id },
      data: { status: "DECLINED", resolvedAt: now },
    });
    return { request: updated, newBalance: request.marriage.jointBalance, approved: false };
  }

  if (request.marriage.jointBalance < request.amount) {
    await prisma.marriageVaultRequest.update({
      where: { id: request.id },
      data: { status: "EXPIRED", resolvedAt: now },
    });
    throw new Error("The Couple Vault no longer has enough money.");
  }

  const result = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId: request.requesterId } });
    if (!wallet) throw new Error("Requester has no wallet.");

    const marriage = await tx.marriage.update({
      where: { id: request.marriageId },
      data: {
        jointBalance: { decrement: request.amount },
        lastDrama: "A vault withdrawal was approved. Trust issues postponed.",
      },
    });
    await tx.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: request.amount } },
    });
    await tx.transaction.create({
      data: { walletId: wallet.id, amount: request.amount, type: "marriage_vault_withdraw", meta: { marriageId: request.marriageId }, isEarned: false },
    });
    const updatedRequest = await tx.marriageVaultRequest.update({
      where: { id: request.id },
      data: { status: "APPROVED", resolvedAt: now },
    });
    return { request: updatedRequest, newBalance: marriage.jointBalance, approved: true };
  });

  return result;
}

function getCooldownRemaining(lastUsed: Date | null | undefined, cooldownMs: number) {
  if (!lastUsed) return 0;
  const elapsed = Date.now() - lastUsed.getTime();
  return Math.max(0, cooldownMs - elapsed);
}

function getActionDrama(action: MarriageAction, affectionDelta: number) {
  const lines: Record<MarriageAction, string[]> = {
    hug: [
      "A warm hug lands at the exact moment both of you needed it.",
      "They pull each other close, and the room remembers how to breathe.",
      "A soft little squeeze says more than a paragraph ever could.",
    ],
    kiss: [
      "A kiss lingers long enough for Fortuna to look away politely.",
      "The kiss starts sweet, then gets just dangerous enough to count.",
      "One kiss, two racing hearts, and absolutely no witnesses worth trusting.",
    ],
    make_love: [
      "The door closes, the lights dim, and the rest is private history.",
      "They disappear into a night of whispered promises and terrible self-control.",
      "Fortuna gives them privacy. The affection bar tells on them later.",
    ],
    date: [
      "Date night begins with fancy plans and ends with both of them laughing too hard.",
      "They spend coins, share dessert, and somehow make it look financially responsible.",
      "A dramatic little date night turns into a memory worth keeping.",
    ],
    chaos: [
      `Chaos Romance shifts affection by ${affectionDelta}. Love remains deeply unserious.`,
    ],
  };
  const pool = lines[action];
  return pool[randomInt(0, pool.length - 1)];
}

export async function runAffectionAction(discordId: string, username: string, action: MarriageAction) {
  const marriage = await getMarriage(discordId);
  if (!marriage) throw new Error("You are not married.");

  let affectionDelta = 0;
  let reward = 0;
  let cost = 0;
  let cooldownMs = CHAOS_COOLDOWN_MS;
  let cooldownField: keyof typeof marriage = "lastChaosAt";
  let drama = "";

  if (action === "chaos") {
    const remaining = getCooldownRemaining(marriage.lastChaosAt, CHAOS_COOLDOWN_MS);
    if (remaining > 0 && !isTester(discordId)) return { success: false, cooldownMs: remaining };

    const events = [
      { affection: [25, 55] as [number, number], reward: [10_000, 35_000] as [number, number], drama: "A surprise karaoke duet somehow becomes romantic evidence." },
      { affection: [10, 35] as [number, number], reward: [0, 15_000] as [number, number], drama: "They cook together. The food survives. Barely." },
      { affection: [-25, -8] as [number, number], reward: [0, 0] as [number, number], drama: "A playful argument over absolutely nothing turns into dramatic couch negotiations." },
      { affection: [40, 85] as [number, number], reward: [20_000, 60_000] as [number, number], drama: "A random adventure turns into the kind of story they will exaggerate forever." },
    ];
    const event = events[randomInt(0, events.length - 1)];
    affectionDelta = randomInt(event.affection[0], event.affection[1]);
    reward = randomInt(event.reward[0], event.reward[1]);
    drama = event.drama;
  } else {
    const config = ACTION_CONFIG[action];
    cooldownField = config.field;
    cooldownMs = config.cooldownMs;
    const remaining = getCooldownRemaining(marriage[config.field] as Date | null, config.cooldownMs);
    if (remaining > 0 && !isTester(discordId)) return { success: false, cooldownMs: remaining };
    affectionDelta = randomInt(config.affection[0], config.affection[1]);
    reward = randomInt(config.reward[0], config.reward[1]);
    cost = config.cost ?? 0;
    drama = getActionDrama(action, affectionDelta);
  }

  const nextAffection = Math.max(0, Math.min(MAX_AFFECTION, marriage.affection + affectionDelta));
  const tier = getAffectionTier(nextAffection);
  const scaledReward = Math.floor(reward * tier.multiplier);

  const wallet = cost > 0 ? await prisma.wallet.findUnique({ where: { userId: discordId } }) : null;
  if (cost > 0 && (!wallet || wallet.balance < cost)) {
    throw new Error(`Date Night costs ${cost.toLocaleString("en-US")} coins.`);
  }

  const now = new Date();
  const data: any = {
    affection: nextAffection,
    lastAffectionActionAt: now,
    decayWarnings: 0,
    lastDrama: drama,
    [cooldownField]: now,
  };

  await prisma.$transaction(async (tx) => {
    if (cost > 0 && wallet) {
      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: cost } },
      });
      await tx.transaction.create({
        data: { walletId: wallet.id, amount: -cost, type: "marriage_date_cost", meta: { marriageId: marriage.id, action }, isEarned: false },
      });
    }

    await tx.marriage.update({
      where: { id: marriage.id },
      data: {
        ...data,
        jointBalance: scaledReward > 0 ? { increment: scaledReward } : undefined,
      },
    });
  });

  return {
    success: true,
    action,
    affectionBefore: marriage.affection,
    affectionAfter: nextAffection,
    affectionDelta,
    reward: scaledReward,
    cost,
    tier,
    drama,
    username,
  };
}

export async function applyMarriageDecay(discordId: string) {
  const marriage = await getMarriage(discordId);
  if (!marriage) return { marriage: null, autoDivorced: false as const, warning: null as string | null };

  const now = new Date();
  if (!marriage.lastAffectionActionAt) {
    const initialized = await prisma.marriage.update({
      where: { id: marriage.id },
      data: { lastAffectionActionAt: marriage.marriedAt },
      include: { spouse1: true, spouse2: true, vaultRequests: true },
    });
    return { marriage: initialized, autoDivorced: false as const, warning: null as string | null };
  }

  const inactiveDays = daysBetween(marriage.lastAffectionActionAt, now);
  if (inactiveDays < DECAY_START_DAYS) {
    return { marriage, autoDivorced: false as const, warning: null as string | null };
  }

  if (inactiveDays >= AUTO_DIVORCE_DAYS && marriage.decayWarnings >= 2) {
    const result = await divorce(discordId, "inactivity");
    return {
      marriage: null,
      autoDivorced: true as const,
      divorce: result,
      warning: "The relationship went silent for too long and ended from inactivity.",
    };
  }

  const shouldDecayToday = !marriage.lastDecayAt || !sameUtcDay(marriage.lastDecayAt, now);
  if (!shouldDecayToday) {
    return {
      marriage,
      autoDivorced: false as const,
      warning: inactiveDays >= AT_RISK_DAYS ? "At Risk: no affection action for 7+ days." : "Affection is decaying from inactivity.",
    };
  }

  const decayAmount = Math.min(75, 15 + (inactiveDays - DECAY_START_DAYS) * 5);
  const nextAffection = Math.max(0, marriage.affection - decayAmount);
  const nextWarnings = marriage.decayWarnings + 1;
  const updated = await prisma.marriage.update({
    where: { id: marriage.id },
    data: {
      affection: nextAffection,
      decayWarnings: nextWarnings,
      lastDecayAt: now,
      lastDrama: inactiveDays >= AT_RISK_DAYS
        ? "The relationship is at risk. Someone needs to make a move."
        : "Affection cooled down from silence.",
    },
    include: { spouse1: true, spouse2: true, vaultRequests: true },
  });

  return {
    marriage: updated,
    autoDivorced: false as const,
    warning: inactiveDays >= AT_RISK_DAYS ? "At Risk: no affection action for 7+ days." : "Affection decayed from inactivity.",
  };
}
