import prisma from "../utils/prisma";

export interface JobRepTier {
  name: string;
  min: number;
  max: number | null;
  payBonus: number;          // multiplier: 1.0 = no bonus
  eventChanceBonus: number;  // added to event trigger chance
  stressReduction: number;   // subtracted from stress gain per shift
  gearWearReduction: number; // subtracted from gear wear per shift
}

const REP_TIERS: JobRepTier[] = [
  { name: "Unknown",    min: 0,    max: 99,   payBonus: 1.00, eventChanceBonus: 0,    stressReduction: 0, gearWearReduction: 0 },
  { name: "Reliable",   min: 100,  max: 249,  payBonus: 1.02, eventChanceBonus: 0.01, stressReduction: 1, gearWearReduction: 1 },
  { name: "Trusted",    min: 250,  max: 499,  payBonus: 1.04, eventChanceBonus: 0.02, stressReduction: 1, gearWearReduction: 2 },
  { name: "Specialist", min: 500,  max: 899,  payBonus: 1.06, eventChanceBonus: 0.03, stressReduction: 2, gearWearReduction: 2 },
  { name: "Elite",      min: 900,  max: 1499, payBonus: 1.08, eventChanceBonus: 0.04, stressReduction: 3, gearWearReduction: 3 },
  { name: "Legendary",  min: 1500, max: null, payBonus: 1.10, eventChanceBonus: 0.05, stressReduction: 4, gearWearReduction: 4 },
];

export function getJobRepTier(rep: number): JobRepTier {
  for (let i = REP_TIERS.length - 1; i >= 0; i--) {
    if (rep >= REP_TIERS[i].min) return REP_TIERS[i];
  }
  return REP_TIERS[0];
}

export function getNextJobRepTier(rep: number): JobRepTier | null {
  const current = getJobRepTier(rep);
  const idx = REP_TIERS.findIndex(t => t.name === current.name);
  return idx < REP_TIERS.length - 1 ? REP_TIERS[idx + 1] : null;
}

export async function getSectorReputation(discordId: string, sector: string): Promise<{
  sector: string;
  rep: number;
  tier: JobRepTier;
  nextTier: JobRepTier | null;
  repToNext: number;
}> {
  const record = await prisma.jobReputation.findUnique({
    where: { userId_sector: { userId: discordId, sector } },
  });
  const rep = record?.rep ?? 0;
  const tier = getJobRepTier(rep);
  const nextTier = getNextJobRepTier(rep);
  const repToNext = nextTier ? nextTier.min - rep : 0;
  return { sector, rep, tier, nextTier, repToNext };
}

export async function addSectorReputation(
  discordId: string,
  sector: string,
  amount: number,
  _reason: string,
): Promise<{ before: number; after: number; delta: number; tierChanged: boolean; tier: JobRepTier }> {
  const existing = await prisma.jobReputation.findUnique({
    where: { userId_sector: { userId: discordId, sector } },
  });
  const before = existing?.rep ?? 0;
  const after = before + amount;

  await prisma.jobReputation.upsert({
    where: { userId_sector: { userId: discordId, sector } },
    create: { userId: discordId, sector, rep: after },
    update: { rep: after },
  });

  const tierBefore = getJobRepTier(before);
  const tierAfter = getJobRepTier(after);
  const tierChanged = tierBefore.name !== tierAfter.name;

  if (tierChanged) {
    console.log(`[JobRep] ${discordId} reached ${tierAfter.name} in ${sector} (${after} rep)`);
  }

  return { before, after, delta: amount, tierChanged, tier: tierAfter };
}

export async function getAllSectorReputation(discordId: string): Promise<Array<{
  sector: string;
  rep: number;
  tier: JobRepTier;
}>> {
  const records = await prisma.jobReputation.findMany({
    where: { userId: discordId },
    orderBy: { rep: "desc" },
  });
  return records.map(r => ({
    sector: r.sector,
    rep: r.rep,
    tier: getJobRepTier(r.rep),
  }));
}
