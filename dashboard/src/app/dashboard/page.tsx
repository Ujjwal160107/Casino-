import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getUserGuilds, getBotGuilds, type DiscordGuild } from "@/lib/discord";
import { redirect } from "next/navigation";
import { ServerList } from "@/components/ServerList";
import { DashboardNavbar } from "@/components/DashboardNavbar";

export default async function DashboardPage() {
    const session = await getServerSession(authOptions);

    if (!session || !session.accessToken) {
        redirect("/");
    }

    const [userGuilds, botGuilds] = await Promise.all([
        getUserGuilds(session.accessToken),
        getBotGuilds()
    ]);

    const botGuildIds = new Set(botGuilds.map((g: DiscordGuild) => g.id));

    // Filter: Admin Permissions (0x8 or 0x20) AND Bot is member
    const validGuilds = userGuilds.filter((guild: DiscordGuild) => {
        const perms = BigInt(guild.permissions);
        const ADMINISTRATOR = BigInt(0x8);
        const MANAGE_GUILD = BigInt(0x20);
        const isAdmin = (perms & ADMINISTRATOR) === ADMINISTRATOR;
        const canManageGuild = (perms & MANAGE_GUILD) === MANAGE_GUILD;
        const isBotMember = botGuildIds.has(guild.id);

        return (isAdmin || canManageGuild) && isBotMember;
    });

    return (
        <div className="min-h-screen bg-zinc-950 relative overflow-hidden font-sans text-foreground selection:bg-primary/30">
            {/* Background Image with Overlay */}
            <div
                className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat fixed"
                style={{ backgroundImage: 'url("/server_list_bg.png")' }}
            >
                <div className="absolute inset-0 bg-zinc-950/80 backdrop-blur-[2px]" />
            </div>

            {/* Navbar */}
            <DashboardNavbar user={session.user} />

            <main className="max-w-7xl mx-auto py-12 relative z-10">
                <div className="text-center mb-16">
                    <h1 className="text-4xl md:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-yellow-200 to-yellow-500 font-serif mb-4 drop-shadow-sm">
                        Select Your Table
                    </h1>
                    <p className="text-zinc-400 text-lg max-w-2xl mx-auto">
                        Choose a server to manage. Only servers where you have Admin access and Fortuna is deployed are shown.
                    </p>
                </div>

                <ServerList guilds={validGuilds} />
            </main>
        </div>
    );
}
