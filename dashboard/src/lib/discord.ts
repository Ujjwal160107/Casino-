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

export interface DiscordChannel {
    id: string;
    type: number; // 0 = GUILD_TEXT, 2 = GUILD_VOICE, ...
    name: string;
    position: number;
    parent_id?: string;
}

export async function getGuildChannels(guildId: string): Promise<DiscordChannel[]> {
    if (!process.env.DISCORD_BOT_TOKEN) return [];

    const res = await fetch(`${DISCORD_API_URL}/guilds/${guildId}/channels`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        next: { revalidate: 300 } // Cache for 5 minutes
    });

    if (!res.ok) {
        console.error(`Failed to fetch channels for guild ${guildId}:`, await res.text());
        return [];
    }
    // Filter for Text Channels (type 0) and Announcement Channels (type 5) if needed
    // For now, let's return all, and filter in UI component if necessary, or just type 0.
    // Usually drops are in text channels.
    const channels = await res.json();
    return channels.filter((c: any) => c.type === 0 || c.type === 5);
}

export interface DiscordMember {
    user: {
        id: string;
        username: string;
        global_name: string | null;
        avatar: string | null;
    };
    nick: string | null;
    roles: string[];
    joined_at: string;
}

export async function getGuildMember(guildId: string, userId: string): Promise<DiscordMember | null> {
    if (!process.env.DISCORD_BOT_TOKEN) return null;

    const res = await fetch(`${DISCORD_API_URL}/guilds/${guildId}/members/${userId}`, {
        headers: { Authorization: `Bot ${process.env.DISCORD_BOT_TOKEN}` },
        next: { revalidate: 0 } // Disable caching to fetch fresh nickname
    });

    if (!res.ok) {
        console.error(`Failed to fetch member ${userId} in guild ${guildId}`, await res.text());
        return null;
    }

    return res.json();
}
