"use server";

export async function getTopGGReviews() {
    try {
        const token = process.env.TOPGG_TOKEN;
        const clientId = process.env.CLIENT_ID || process.env.DISCORD_CLIENT_ID;

        if (!token || !clientId) {
            console.error("Missing TOPGG_TOKEN or CLIENT_ID (or DISCORD_CLIENT_ID)");
            return [];
        }

        const response = await fetch(`https://top.gg/api/bots/${clientId}/reviews`, {
            headers: {
                Authorization: token,
            },
            next: { revalidate: 3600 },
        });

        if (!response.ok) {
            console.error(`[TopGG] Failed to fetch reviews: ${response.status} ${response.statusText}`);
            const text = await response.text();
            console.error(`[TopGG] Response: ${text}`);
            return [];
        }

        const data = await response.json();
        console.log(`[TopGG] Fetched ${Array.isArray(data) ? data.length : 0} reviews.`);
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("[TopGG] Error fetching reviews:", error);
        return [];
    }
}
