/**
 * Compresses the top of the wealth distribution after the zoo exploit, and
 * optionally clears every caught animal.
 *
 * DRY RUN BY DEFAULT. Nothing is written unless you pass --apply.
 *
 *   npx ts-node --transpile-only src/scripts/economyRebalance.ts            # preview
 *   npx ts-node --transpile-only src/scripts/economyRebalance.ts --apply    # write
 *
 * Money: balances at or below THRESHOLD are left completely alone -- ordinary
 * players did nothing wrong and their numbers should not move. Only the excess
 * above the threshold is compressed, through a power curve that preserves
 * ranking while pulling 728M down to roughly 15M.
 *
 *     new = THRESHOLD + SCALE * (old - THRESHOLD) ^ EXPONENT
 *
 * A flat divisor was considered and rejected: dividing everyone by 100 relabels
 * the numbers but leaves the top ten holding the same 92% of the economy.
 *
 * Animals: --clear-animals deletes every CaughtAnimal row. Owned zoos live in
 * OwnedProperty and are never touched, so players keep the zoo they paid for
 * and simply have nothing in it.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Each destructive operation opts in separately, so "--apply --clear-animals"
// cannot quietly rewrite balances as well.
const APPLY = process.argv.includes("--apply");
const CLEAR_ANIMALS = process.argv.includes("--clear-animals");
const REBALANCE_MONEY = process.argv.includes("--rebalance-money");

/** Balances at or below this are untouched. Roughly the p90 of the healthy
 *  population, so only exploit-scale wealth is affected. */
const THRESHOLD = 5_000_000;
/** Tuned so the 728M top account lands near 15M and ordering is preserved. */
const SCALE = 750;
const EXPONENT = 0.4655;

const fmt = (n: number) => {
    const abs = Math.abs(n);
    if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
    if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
    if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
    return n.toFixed(0);
};

/** Ordering-preserving compression of everything above THRESHOLD.
 *
 *  The Math.min is not cosmetic. Just above the threshold the power curve
 *  climbs faster than identity -- at 5.07M it returns 5.14M -- so without the
 *  clamp a deflation pass would hand money to the players nearest the cut.
 *  Clamping guarantees this function can only ever reduce a balance. */
export const compress = (v: number): number => {
    if (v <= THRESHOLD) return v;
    return Math.min(v, Math.round(THRESHOLD + SCALE * Math.pow(v - THRESHOLD, EXPONENT)));
};

async function main() {
    console.log(APPLY ? "*** APPLYING CHANGES ***\n" : "DRY RUN -- nothing will be written\n");

    const users = await prisma.user.findMany({
        select: {
            discordId: true,
            username: true,
            wallet: { select: { id: true, balance: true } },
            bank: { select: { id: true, balance: true } },
        },
    });

    type Change = {
        id: string; name: string;
        cash: number; newCash: number; walletId?: string;
        bank: number; newBank: number; bankId?: string;
    };

    const changes: Change[] = [];
    let supplyBefore = 0;
    let supplyAfter = 0;

    for (const u of users) {
        const cash = u.wallet?.balance ?? 0;
        const bank = u.bank?.balance ?? 0;
        // Compress on total net worth, then split the result back across the
        // two balances in the original proportion -- compressing each pot
        // separately would penalise anyone who happened to split their money.
        const net = cash + bank;
        supplyBefore += net;

        const newNet = compress(net);
        supplyAfter += newNet;
        if (newNet === net) continue;

        const ratio = net === 0 ? 0 : newNet / net;
        changes.push({
            id: u.discordId, name: u.username,
            cash, newCash: Math.round(cash * ratio), walletId: u.wallet?.id,
            bank, newBank: Math.round(bank * ratio), bankId: u.bank?.id,
        });
    }

    changes.sort((a, b) => (b.cash + b.bank) - (a.cash + a.bank));

    console.log(`accounts affected : ${changes.length} of ${users.length}`);
    console.log(`supply before     : ${fmt(supplyBefore)}`);
    console.log(`supply after      : ${fmt(supplyAfter)}  (${((supplyAfter / supplyBefore) * 100).toFixed(1)}% retained)`);
    console.log(`threshold         : ${fmt(THRESHOLD)} -- balances at or below this are untouched\n`);

    console.log("  net before   net after    user");
    for (const c of changes) {
        console.log(
            `  ${fmt(c.cash + c.bank).padEnd(12)} ${fmt(c.newCash + c.newBank).padEnd(12)} ${c.name}`,
        );
    }

    const animals = await prisma.caughtAnimal.count();
    const zoos = await prisma.ownedProperty.count({
        where: { property: { key: { in: ["mini_zoo", "city_zoo", "world_zoo"] } } },
    });
    console.log(`\ncaught animals    : ${animals}${CLEAR_ANIMALS ? "  -> ALL WILL BE DELETED" : "  (unchanged; pass --clear-animals)"}`);
    console.log(`owned zoos        : ${zoos}  -> kept, never touched`);

    if (!APPLY) {
        console.log("\nDry run complete. Re-run with --apply to write these changes.");
        return;
    }

    if (REBALANCE_MONEY) {
        for (const c of changes) {
            if (c.walletId) {
                await prisma.wallet.update({ where: { id: c.walletId }, data: { balance: c.newCash } });
            }
            if (c.bankId) {
                await prisma.bank.update({ where: { id: c.bankId }, data: { balance: c.newBank } });
            }
        }
        console.log(`\nrebalanced ${changes.length} account(s)`);
    } else {
        console.log("\nbalances untouched (pass --rebalance-money to apply them)");
    }

    if (CLEAR_ANIMALS) {
        const { count } = await prisma.caughtAnimal.deleteMany({});
        console.log(`deleted ${count} caught animal(s); zoos left intact`);
    }
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
