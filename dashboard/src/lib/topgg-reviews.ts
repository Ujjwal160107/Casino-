"use server";

import { promises as fs } from "fs";
import path from "path";

export async function getTopGGReviews() {
    try {
        const filePath = path.join(process.cwd(), "..", "reviews.json");

        try {
            await fs.access(filePath);
        } catch {
            console.log("[TopGG] no local reviews.json found, returning empty list.");
            return [];
        }

        const content = await fs.readFile(filePath, "utf8");
        const reviews = JSON.parse(content);

        return reviews
            .filter((r: any) =>
                r.username &&
                r.username !== "Ratings & Reviews" &&
                r.review.length > 20
            )
            .map((r: any, index: number) => ({
                id: r.id || index.toString(),
                username: r.username,
                avatar: r.avatar || "",
                content: r.review || r.content || "",
                score: r.rating || r.score || 5,
                date: r.date || new Date().toISOString()
            }));
    } catch (error) {
        console.error("[TopGG] Failed to read cached reviews:", error);
        return [];
    }
}
