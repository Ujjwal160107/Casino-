/**
 * READ-ONLY audit of the money supply and zoo holdings.
 *
 * Writes nothing. Run it before and after any rebalance so the effect is
 * measured rather than assumed.
 *
 * Run: npx ts-node --transpile-only src/scripts/economyAudit.ts
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ZOO_KEYS = ["mini_zoo", "city_zoo", "world_zoo"];

const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
};

const percentile = (sorted: number[], p: number) =>
    sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] : 0;

async function main() {
    console.log("=== MONEY SUPPLY ===\n");

    const users = await prisma.user.findMany({
        select: {
            discordId: true,
            username: true,
            wallet: { select: { balance: true } },
            bank: { select: { balance: true } },
        },
    });

    const holdings = users
        .map((u) => ({
            id: u.discordId,
            name: u.username,
            cash: u.wallet?.balance ?? 0,
            bank: u.bank?.balance ?? 0,
            net: (u.wallet?.balance ?? 0) + (u.bank?.balance ?? 0),
        }))
        .sort((a, b) => b.net - a.net);

    const total = holdings.reduce((s, h) => s + h.net, 0);
    const nets = holdings.map((h) => h.net).sort((a, b) => a - b);
    const nonZero = holdings.filter((h) => h.net > 0);

    console.log(`accounts          : ${holdings.length} (${nonZero.length} with a positive balance)`);
    console.log(`total money supply: ${fmt(total)}`);
    console.log(`mean / median     : ${fmt(total / (holdings.length || 1))} / ${fmt(percentile(nets, 50))}`);
    console.log(`p90 / p99 / max   : ${fmt(percentile(nets, 90))} / ${fmt(percentile(nets, 99))} / ${fmt(nets[nets.length - 1] ?? 0)}`);

    // How concentrated is it? This is what tells us whether a handful of
    // accounts caused the inflation or whether it is spread across everyone.
    const top10 = holdings.slice(0, 10).reduce((s, h) => s + h.net, 0);
    const top50 = holdings.slice(0, 50).reduce((s, h) => s + h.net, 0);
    console.log(`held by top 10    : ${fmt(top10)} (${((top10 / total) * 100).toFixed(1)}%)`);
    console.log(`held by top 50    : ${fmt(top50)} (${((top50 / total) * 100).toFixed(1)}%)`);

    console.log("\n--- top 25 by net worth ---");
    console.log("  #  net         cash        bank        user");
    holdings.slice(0, 25).forEach((h, i) => {
        console.log(
            `  ${String(i + 1).padStart(2)} ${fmt(h.net).padEnd(11)} ${fmt(h.cash).padEnd(11)} ${fmt(h.bank).padEnd(11)} ${h.name} (${h.id})`,
        );
    });

    console.log("\n\n=== ZOO AND ANIMALS ===\n");

    const totalAnimals = await prisma.caughtAnimal.count();
    const inZoo = await prisma.caughtAnimal.count({ where: { inZoo: true } });
    console.log(`caught animals    : ${totalAnimals}`);
    console.log(`  of those, in zoo: ${inZoo}`);
    console.log(`  held outside zoo: ${totalAnimals - inZoo}`);

    const zooProps = await prisma.property.findMany({
        where: { key: { in: ZOO_KEYS } },
        select: { id: true, key: true, name: true, _count: { select: { owners: true } } },
    });
    console.log("\n--- zoos owned (these must survive) ---");
    for (const p of zooProps) {
        console.log(`  ${p.key.padEnd(12)} ${String(p._count.owners).padStart(5)} owner(s)`);
    }

    const byOwner = await prisma.caughtAnimal.groupBy({
        by: ["discordId"],
        _count: { _all: true },
        orderBy: { _count: { discordId: "desc" } },
        take: 15,
    });
    console.log("\n--- top 15 animal holders ---");
    for (const row of byOwner) {
        const u = users.find((x) => x.discordId === row.discordId);
        console.log(`  ${String(row._count._all).padStart(5)}  ${u?.username ?? "?"} (${row.discordId})`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
