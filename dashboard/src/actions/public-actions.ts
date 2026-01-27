"use server";

import { promises as fs } from "fs";
import path from "path";

export async function getTopGGReviews() {
    try {
        // Resolve path to reviews.json in the root directory
        const filePath = path.join(process.cwd(), "..", "reviews.json");

        // Check if file exists
        try {
            await fs.access(filePath);
        } catch {
            console.log("[TopGG] no local reviews.json found, returning defaults.");
            return getDefaultReviews();
        }

        const content = await fs.readFile(filePath, "utf8");
        const reviews = JSON.parse(content);

        // Basic filtering to remove header junk if any
        return reviews.filter((r: any) =>
            r.username &&
            r.username !== "Ratings & Reviews" &&
            r.review.length > 20
        );
    } catch (error) {
        console.error("[TopGG] Failed to read cached reviews:", error);
        return getDefaultReviews();
    }
}

function getDefaultReviews() {
    return [
        {
            id: "1",
            username: "CasinoEnthusiast",
            avatar: "",
            content: "The best economy bot I've used! The blackjack animation is smooth and addicting.",
            score: 5,
            date: new Date().toISOString()
        },
        {
            id: "2",
            username: "ServerOwner_99",
            avatar: "",
            content: "Great add-on for my community. Keeps everyone engaged with the shop and games.",
            score: 5,
            date: new Date().toISOString()
        }
    ];
}
