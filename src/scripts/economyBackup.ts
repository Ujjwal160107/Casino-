/**
 * READ-ONLY export of everything the rebalance can modify, so any change is
 * reversible. Writes nothing to the database.
 *
 * Run: npx ts-node --transpile-only src/scripts/economyBackup.ts [outDir]
 *
 * Captures CaughtAnimal in full (it gets deleted), plus Wallet and Bank
 * balances (they get rewritten). Owned zoos are included for reference even
 * though nothing touches them -- if a restore is ever needed you want to see
 * what the zoo layout was at the time.
 */
import "dotenv/config";
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const outDir = path.resolve(process.argv[2] ?? `backups/${stamp}`);
    fs.mkdirSync(outDir, { recursive: true });

    const write = (name: string, rows: unknown[]) => {
        const file = path.join(outDir, `${name}.json`);
        fs.writeFileSync(file, JSON.stringify(rows, null, 2), "utf8");
        const kb = (fs.statSync(file).size / 1024).toFixed(0);
        console.log(`  ${String(rows.length).padStart(6)} rows  ${kb.padStart(6)} KB  ${name}.json`);
    };

    console.log(`Backing up to ${outDir}\n`);

    write("caughtAnimal", await prisma.caughtAnimal.findMany());
    write("wallet", await prisma.wallet.findMany({ select: { id: true, userId: true, balance: true } }));
    write("bank", await prisma.bank.findMany({ select: { id: true, userId: true, balance: true } }));
    write(
        "ownedZoos",
        await prisma.ownedProperty.findMany({
            where: { property: { key: { in: ["mini_zoo", "city_zoo", "world_zoo"] } } },
            include: { property: { select: { key: true, name: true } } },
        }),
    );

    console.log(`\nBackup complete: ${outDir}`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
