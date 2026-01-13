export interface DiscordGuild {
    id: string;
    name: string;
    icon: string | null;
    permissions: string;
}

const DISCORD_API_URL = "https://discord.com/api/v10";

export async function getUserGuilds(accessToken: string): Promise<DiscordGuild[]> {
    const res = await fetch(`${DISCORD_API_URL}/users/@me/guilds`, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
        },
    });

    if (!res.ok) {
        if (res.status === 429) {
            // Rate limited
            console.error("Rate limited fetching user guilds");
            return [];
        }
        console.error("Failed to fetch user guilds", await res.text());
        return [];
    }

    return res.json();
}

export async function getBotGuilds(): Promise<DiscordGuild[]> {
    if (!process.env.DISCORD_BOT_TOKEN) {
        console.error("DISCORD_BOT_TOKEN is not defined");
        return [];
    }

    const res = await fetch(`${DISCORD_API_URL}/users/@me/guilds`, {
        headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
    });

    if (!res.ok) {
        console.error("Failed to fetch bot guilds", await res.text());
        return [];
    }

    return res.json();
}

export async function getGuild(guildId: string): Promise<DiscordGuild | null> {
    if (!process.env.DISCORD_BOT_TOKEN) {
        console.error("DISCORD_BOT_TOKEN is not defined");
        return null;
    }

    const res = await fetch(`${DISCORD_API_URL}/guilds/${guildId}`, {
        headers: {
            Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}`,
        },
        next: { revalidate: 3600 } // Cache for 1 hour
    });

    if (!res.ok) {
        console.error(`Failed to fetch guild ${guildId}`, await res.text());
        return null;
    }

    return res.json();
}

export interface DiscordRole {
    id: string;
    name: string;
    color: number;
    hoist: boolean;
    position: number;
    permissions: string;
    managed: boolean;
    mentionable: boolean;
}

export async function getGuildRoles(guildId: string): Promise<DiscordRole[]> {
    if (!process.env.DISCORD_BOT_TOKEN) return [];

    const res = await fetch(`${DISCORD_API_URL}/guilds/${guildId}/roles`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        next: { revalidate: 600 } // Cache for 10 minutes
    });

    if (!res.ok) return [];
    return res.json();
}
