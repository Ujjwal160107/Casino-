"use server";

export async function getTopGGReviews() {
    try {
        const token = process.env.TOPGG_TOKEN;
        const clientId = process.env.CLIENT_ID;

        if (!token || !clientId) {
            console.error("Missing TOPGG_TOKEN or CLIENT_ID");
            return [];
        }

        const response = await fetch(`https://top.gg/api/bots/${clientId}/reviews`, {
            headers: {
                Authorization: token,
            },
            next: { revalidate: 3600 }, // Cache for 1 hour
        });

        if (!response.ok) {
            console.error(`Failed to fetch reviews: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        // Top.gg returns an array of reviews directly or paginated? 
        // Docs say GET /bots/:id/reviews returns an array.
        return Array.isArray(data) ? data : [];
    } catch (error) {
        console.error("Error fetching Top.gg reviews:", error);
        return [];
    }
}
