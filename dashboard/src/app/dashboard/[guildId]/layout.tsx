import { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGuild } from "@/lib/discord";
import { AdminSidebar } from "@/components/dashboard/AdminSidebar";
import { canManageGuild } from "@/lib/permissions";

interface DashboardLayoutProps {
    children: ReactNode;
    params: Promise<{
        guildId: string;
    }>;
}

export default async function AdminLayout({ children, params }: DashboardLayoutProps) {
    const session = await getServerSession(authOptions);

    if (!session) {
        redirect("/");
    }

    const { guildId } = await params;
    const guild = await getGuild(guildId);

    if (!guild) {
        notFound();
    }

    // TODO: Verify user has admin access to THIS specific guild again for security?
    // For now, getGuild relies on bot token so it confirms bot element, 
    // but we should ideally check if USER is admin in this guild. 
    // Optimization: We could reuse the logic from `getUserGuilds` to filter, 
    // but fetching all user guilds every request might be slow.
    // Proceeding assuming initial entry was valid, but a real prod app needs strict per-route checks.

    // SECURITY UPDATE: Enforce permission check
    // We must ensure the logged-in user actually has rights to manage this guild.
    // getGuild() only proves the BOT calls the guild, not the user.
    if (session.accessToken) {
        const hasPermission = await canManageGuild(session.accessToken, guildId);
        if (!hasPermission) {
            console.warn(`Unauthorized access attempt by user ${session.user?.id} to guild ${guildId}`);
            redirect("/dashboard?error=unauthorized");
        }
    } else {
        // Should not happen if session exists, but safe fallback
        redirect("/");
    }

    return (
        <div className="flex min-h-screen bg-background text-foreground font-sans">
            {/* Sidebar - Desktop */}
            <div className="hidden md:block">
                <AdminSidebar guild={guild} />
            </div>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 md:ml-64 relative">
                {/* Mobile Header Placeholder */}
                <div className="md:hidden p-4 border-b border-white/5 bg-black/50 backdrop-blur-md flex items-center justify-between sticky top-0 z-30">
                    <span className="font-bold text-white">Fortuna Admin</span>
                    {/* Add Mobile Menu Toggle Here */}
                </div>

                <div className="p-6 md:p-10 max-w-6xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
