import { loadImage } from "canvas";

type Context = any;

function drawRoundedRect(ctx: Context, x: number, y: number, w: number, h: number, r: number) {
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

async function drawAvatar(ctx: Context, url: string, x: number, y: number, size: number, border: boolean = true, borderColor: string = "#fff") {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    try {
        const img = await loadImage(url);
        ctx.drawImage(img, x, y, size, size);
    } catch {
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

export async function drawRankCard(ctx: Context, width: number, height: number, theme: string, data: any) {
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



    // Removed Level/Rank/XP Bar
    ctx.textAlign = "left";
}