import { getUserGuilds } from "./discord";

const PERMISSIONS = {
    ADMINISTRATOR: 0x8,
    MANAGE_GUILD: 0x20,
};

/**
 * Checks if the user has permission to manage the specified guild.
 * @param accessToken The user's Discord OAuth2 access token.
 * @param guildId The ID of the guild to check.
 * @returns boolean indicating if the user has access.
 */
export async function canManageGuild(accessToken: string, guildId: string): Promise<boolean> {
    try {
        // Fetch user's guilds. 
        // Note: In a high-traffic production app, you'd want to cache this response 
        // or prioritize checking the specific guild via a bot check if possible, 
        // but checking via user token is the most secure way to verify *their* permissions.
        const guilds = await getUserGuilds(accessToken);

        const guild = guilds.find(g => g.id === guildId);

        if (!guild) {
            // User is not even in the guild
            return false;
        }

        const permissions = BigInt(guild.permissions);
        const admin = BigInt(PERMISSIONS.ADMINISTRATOR);
        const manageGuild = BigInt(PERMISSIONS.MANAGE_GUILD);

        // Check for Administrator OR Manage Guild
        const hasAdmin = (permissions & admin) === admin;
        const hasManageGuild = (permissions & manageGuild) === manageGuild;

        return hasAdmin || hasManageGuild;
    } catch (error) {
        console.error("Error checking guild permissions:", error);
        return false;
    }
}
