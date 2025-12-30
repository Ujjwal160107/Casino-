"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateVsImage = generateVsImage;
exports.generateWinnerImage = generateWinnerImage;
const canvas_1 = require("canvas");
const discord_js_1 = require("discord.js");
const path_1 = __importDefault(require("path"));
async function generateVsImage(avatarUrl1, avatarUrl2) {
    const width = 600;
    const height = 200;
    const canvas = (0, canvas_1.createCanvas)(width, height);
    const ctx = canvas.getContext("2d");
    // Load Background
    try {
        const bgPath = path_1.default.join(__dirname, "../assets/cockfight_bg.png");
        const bg = await (0, canvas_1.loadImage)(bgPath);
        ctx.drawImage(bg, 0, 0, width, height);
    }
    catch (e) {
        // Fallback Gradient
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, "#1a1a1a");
        gradient.addColorStop(0.5, "#4a0000");
        gradient.addColorStop(1, "#1a1a1a");
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);
    }
    // Load Avatars
    try {
        const avatar1 = await (0, canvas_1.loadImage)(avatarUrl1.replace("webp", "png"));
        const avatar2 = await (0, canvas_1.loadImage)(avatarUrl2.replace("webp", "png"));
        // Helper to draw circle avatar
        const drawAvatar = (img, x, y, size, color) => {
            ctx.save();
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, x, y, size, size);
            ctx.restore();
            // Border
            ctx.beginPath();
            ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2, true);
            ctx.lineWidth = 5;
            ctx.strokeStyle = color;
            ctx.stroke();
        };
        drawAvatar(avatar1, 50, 25, 150, "#00ccff"); // Player 1 (Blue)
        drawAvatar(avatar2, 400, 25, 150, "#ff3300"); // Player 2 (Red)
    }
    catch (e) {
        console.error("Failed to load avatars for VS image", e);
    }
    // VS Text
    ctx.font = "bold 60px sans-serif";
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#000000";
    ctx.shadowBlur = 10;
    ctx.lineWidth = 3;
    ctx.strokeText("VS", width / 2, height / 2);
    ctx.fillText("VS", width / 2, height / 2);
    return new discord_js_1.AttachmentBuilder(canvas.toBuffer(), { name: "vs.png" });
}
async function generateWinnerImage(avatarUrl, winnerName) {
    const width = 600;
    const height = 300; // Taller for winner
    const canvas = (0, canvas_1.createCanvas)(width, height);
    const ctx = canvas.getContext("2d");
    // Load Background
    try {
        const bgPath = path_1.default.join(__dirname, "../assets/cockfight_bg.png");
        const bg = await (0, canvas_1.loadImage)(bgPath);
        // Maintain aspect ratio or stretch? The provided image is 16:9 ish. 
        // Let's stretch for banner style or crop. 
        // Simple stretch for now to fill
        ctx.drawImage(bg, 0, 0, width, height);
    }
    catch {
        ctx.fillStyle = "#FFD700";
        ctx.fillRect(0, 0, width, height);
    }
    // Dark overlay for text pop
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.fillRect(0, 0, width, height);
    try {
        const avatar = await (0, canvas_1.loadImage)(avatarUrl.replace("webp", "png"));
        ctx.save();
        ctx.beginPath();
        ctx.arc(width / 2, height / 2 - 20, 80, 0, Math.PI * 2, true);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(avatar, width / 2 - 80, height / 2 - 100, 160, 160);
        ctx.restore();
        ctx.beginPath();
        ctx.arc(width / 2, height / 2 - 20, 80, 0, Math.PI * 2, true);
        ctx.lineWidth = 6;
        ctx.strokeStyle = "#FFD700"; // Gold border
        ctx.stroke();
    }
    catch (e) { }
    // Text
    ctx.font = "bold 40px sans-serif";
    ctx.fillStyle = "#FFD700";
    ctx.textAlign = "center";
    ctx.shadowColor = "black";
    ctx.shadowBlur = 10;
    ctx.strokeText("WINNER!", width / 2, height - 60);
    ctx.fillText("WINNER!", width / 2, height - 60);
    ctx.font = "bold 30px sans-serif";
    ctx.fillStyle = "white";
    ctx.fillText(winnerName, width / 2, height - 20);
    return new discord_js_1.AttachmentBuilder(canvas.toBuffer(), { name: "winner.png" });
}
//# sourceMappingURL=imageUtils.js.map