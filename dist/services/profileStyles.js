"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.drawRankCard = drawRankCard;
const canvas_1 = require("canvas");
function drawRoundedRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}
async function drawAvatar(ctx, url, x, y, size, border = true, borderColor = "#fff") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const img = await (0, canvas_1.loadImage)(url);
        ctx.drawImage(img, x, y, size, size);
    }
    catch {
        ctx.fillStyle = "#555";
        ctx.fillRect(x, y, size, size);
    }
    ctx.restore();
    if (border) {
        ctx.strokeStyle = borderColor;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
        ctx.stroke();
    }
}
async function drawRankCard(ctx, width, height, theme, data) {
    // Default Style (Classic)
    const backgroundColor = '#1a1a1a';
    const cardColor = '#2b2b2b';
    const textColor = '#ffffff';
    const primaryColor = '#00ff00';
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = cardColor;
    ctx.fillRect(10, 10, width - 20, height - 20);
    await drawAvatar(ctx, data.avatarUrl, 30, 45, 160, true, primaryColor);
    ctx.fillStyle = textColor;
    ctx.font = "bold 34px sans-serif";
    ctx.fillText(data.username, 220, 80);
    ctx.font = "20px sans-serif";
    ctx.fillText(`Rank #${data.rank}  Level ${data.level}`, 220, 115);
    // XP Bar
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(220, 150, 500, 20);
    const fillWidth = 500 * Math.min(Math.max(data.currentXp / data.requiredXp, 0), 1);
    ctx.fillStyle = primaryColor;
    ctx.fillRect(220, 150, fillWidth, 20);
    ctx.fillStyle = textColor;
    ctx.textAlign = "right";
    ctx.font = "20px sans-serif";
    ctx.fillText(`${data.currentXp} / ${data.requiredXp} XP`, 720, 115);
    ctx.textAlign = "left";
}
//# sourceMappingURL=profileStyles.js.map