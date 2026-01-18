import { getRoleIncomes } from "@/actions/income-actions";
import { getGuildRoles } from "@/lib/discord";
import { RoleIncomeForm } from "@/components/dashboard/shop/RoleIncomeForm";

interface PageProps {
    params: Promise<{
        guildId: string;
    }>;
}

export default async function RoleIncomePage({ params }: PageProps) {
    const { guildId } = await params;

    const [incomes, roles] = await Promise.all([
        getRoleIncomes(guildId),
        getGuildRoles(guildId)
    ]);

    // Map Prisma result to form shape (ensure incomeType is present)
    const formattedIncomes = incomes.map(i => ({
        roleId: i.roleId,
        amount: i.amount,
        cooldown: i.cooldown,
        incomeType: (i.incomeType as "COLLECTIBLE" | "AUTOMATIC") || "COLLECTIBLE"
    }));

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white mb-2 font-serif">Role Income</h1>
                <p className="text-zinc-400">Configure passive income for specific Discord roles.</p>
            </div>

            <RoleIncomeForm
                guildId={guildId}
                initialIncomes={formattedIncomes}
                roles={roles.map(r => ({ id: r.id, name: r.name, color: r.color }))}
            />
        </div>
    );
}
