import path from "path";

export const Mascot = {
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
        Decline: "<a:decline:1455106146120761492>",
        Alert: "<:alert_sign:1455458789934235738>",

        // Job Emojis
        JobTech: "<:fortuna_engineer:1455563457112969331>",
        JobMedical: "<:fortuna_doctor:1455563555930636331>",
        JobBusiness: "<:fortuna_business:1455564125534031883>",
        JobLegal: "<:fortuna_lawyer:1455564518217351251>",
        JobService: "<:fortuna_coffee:1455565452670664736>", // Chef/Service
        JobTrade: "<:fortuna_mechanic:1455568751343960064>", // Mechanic/Blue Collar

        JobWorking: "<:fortuna_working:1455570584455872553>",
        JobPromotion: "<:fortuna_mod:1455572710632587368>",
        Monitor: "<:fortuna_engineer:1455563457112969331>",
        Trash: "🗑️" // Fallback standard emoji
    },
    Images: {
        Main: path.join(process.cwd(), "src", "assets", "fortuna.jpg")
    },
    Colors: {
        Base: "#9B59B6" // Purple-ish to match her hair?
    }
};

export function getEmoteUrl(emote: string): string | null {
    if (!emote) return null;
    const match = emote.match(/:(\d+)>/);
    if (match && match[1]) {
        return `https://cdn.discordapp.com/emojis/${match[1]}.png`;
    }
    return null;
}
