"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Mascot = void 0;
exports.getEmoteUrl = getEmoteUrl;
const path_1 = __importDefault(require("path"));
exports.Mascot = {
    Name: "Lady Fortuna",
    Emotes: {
        Success: "<:fortuna_sparkle:1454885735818858691>",
        Fail: "<:fortuna_sad:1454885729128812555>",
        Confused: "<:fortuna_confused:1454885723072106627>", // Unknown cmd
        Angry: "<:fortuna_angry:1454885720316575916>", // Cooldowns
        Think: "<:fortuna_think:1454885738373185743>",
        Shocked: "<:fortuna_shocked:1454885731611840643>",
        Love: "<:fortuna_heart:1454885726121623677>",
        Money: "<:fortuna_money:1454887481924386899>",
        Teacher: "<:fortuna_teacher:1455068530641862667>",
        TeacherAngry: "<:fortuna_teacher_angry:1455068668391329843>",
        TeacherSad: "<:fortuna_teacher_sad:1455072980466929768>",
        Graduate: "<:fortuna_graduate:1455091834303942729>",
        MoneyBag: "<:MoneyBag:1446970451606896781>",
        Meditation: "<:fortuna_medidate:1455103880982565008>",
        Sports: "<:fortuna_sports:1455103427473440768>",
        Gym: "<:fortuna_gym:1455103411866566716>",
        Accept: "<:tick:1455105986120515656>",
        Decline: "<a:decline:1455106146120761492>"
    },
    Images: {
        Main: path_1.default.join(process.cwd(), "src", "assets", "fortuna.jpg")
    },
    Colors: {
        Base: "#9B59B6" // Purple-ish to match her hair?
    }
};
function getEmoteUrl(emote) {
    const match = emote.match(/:(\d+)>/);
    if (match && match[1]) {
        return `https://cdn.discordapp.com/emojis/${match[1]}.png`;
    }
    return null;
}
//# sourceMappingURL=branding.js.map