import { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getGuild } from "@/lib/discord";
import { AdminSidebar } from "@/components/dashboard/AdminSidebar";
import { DashboardNavbar } from "@/components/dashboard/DashboardNavbar";
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

    // SECURITY UPDATE: Enforce permission check
    if (session.accessToken) {
        const hasPermission = await canManageGuild(session.accessToken, guildId);
        if (!hasPermission) {
            console.warn(`Unauthorized access attempt by user ${session.user?.id} to guild ${guildId}`);
            redirect("/dashboard?error=unauthorized");
        }
    } else {
        redirect("/");
    }

    return (
        <div className="min-h-screen bg-background text-foreground font-sans">
            <DashboardNavbar guild={guild} user={session.user} />

            {/* Sidebar - Desktop */}
            <div className="hidden md:block">
                <AdminSidebar guild={guild} />
            </div>

            {/* Main Content Area */}
            <main className="flex-1 min-w-0 md:ml-64 pt-16 relative">
                <div className="p-6 md:p-10 max-w-7xl mx-auto">
                    {children}
                </div>
            </main>
        </div>
    );
}
