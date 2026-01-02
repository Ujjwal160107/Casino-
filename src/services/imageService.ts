import { createCanvas } from "canvas";
import { AttachmentBuilder } from "discord.js";
import * as Styles from "./profileStyles";

export async function generateRankCard(
    user: any,
    theme: string = "classic") {
    const width = 800;
    const height = 250;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext("2d");
    try {
        await Styles.drawRankCard(ctx, width, height, theme, user);
        return new AttachmentBuilder(canvas.toBuffer(), { name: "rank.png" });
    } catch (error) {
        console.error("Error generating rank card:", error);
        return new AttachmentBuilder(canvas.toBuffer(), { name: "rank-error.png" });
    }
}