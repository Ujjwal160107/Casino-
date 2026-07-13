/**
 * One-time migration: collapse multi-zoo owners onto their single biggest zoo.
 *
 * Zoos became a single-slot upgrade ladder (Mini 5 < City 10 < World 16). Under
 * the old system a player could own several zoos at once; this keeps each
 * player's highest-capacity zoo and removes the smaller OwnedProperty rows.
 *
 * NO refund is issued. CaughtAnimal rows are never touched — animals are
 * user-scoped (discordId + inZoo), with no relation to OwnedProperty, so every
 * animal stays in the zoo. Idempotent: safe to run more than once.
 *
 * Usage: npx ts-node src/scripts/collapseMultiZoos.ts
 */
import { PrismaClient } from "@prisma/client";
import { ZOO_CAPACITY } from "../utils/animalCatalog";

const prisma = new PrismaClient();

async function main() {
  const zooKeys = Object.keys(ZOO_CAPACITY);

  const zooProperties = await prisma.property.findMany({
    where: { key: { in: zooKeys } },
  });
  const capByPropertyId = new Map<string, number>();
  const nameByPropertyId = new Map<string, string>();
  for (const p of zooProperties) {
    capByPropertyId.set(p.id, ZOO_CAPACITY[p.key] ?? 0);
    nameByPropertyId.set(p.id, p.name);
  }
  const zooPropertyIds = zooProperties.map((p) => p.id);

  const ownedZoos = await prisma.ownedProperty.findMany({
    where: { propertyId: { in: zooPropertyIds } },
  });

  // Group owned zoos by user.
  const byUser = new Map<string, typeof ownedZoos>();
  for (const row of ownedZoos) {
    const list = byUser.get(row.userId) ?? [];
    list.push(row);
    byUser.set(row.userId, list);
  }

  let usersCollapsed = 0;
  let rowsRemoved = 0;

  for (const [userId, rows] of byUser) {
    if (rows.length <= 1) continue;

    // Keep the highest-capacity zoo (ties: keep the first, delete the rest).
    const sorted = [...rows].sort(
      (a, b) => (capByPropertyId.get(b.propertyId) ?? 0) - (capByPropertyId.get(a.propertyId) ?? 0),
    );
    const keep = sorted[0];
    const remove = sorted.slice(1);

    await prisma.ownedProperty.deleteMany({ where: { id: { in: remove.map((r) => r.id) } } });

    usersCollapsed++;
    rowsRemoved += remove.length;
    const keepName = nameByPropertyId.get(keep.propertyId) ?? keep.propertyId;
    const removedNames = remove.map((r) => nameByPropertyId.get(r.propertyId) ?? r.propertyId).join(", ");
    console.log(`User ${userId}: kept ${keepName}, removed ${removedNames}`);
  }

  console.log(
    `\nDone. Collapsed ${usersCollapsed} multi-zoo user(s), removed ${rowsRemoved} redundant zoo row(s). No animals affected.`,
  );
}

main()
  .catch((err) => {
    console.error("collapseMultiZoos failed:", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
