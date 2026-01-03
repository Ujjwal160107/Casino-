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
        Confused: "<:fortuna_confused:1454885723072106627>",
        Angry: "<:fortuna_angry:1454885720316575916>",
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
        Accept: "<:n_check:1451281806279311435>",
        Decline: "<a:decline:1455106146120761492>",
        Chicken: "<:cock:1451281426329768172>",
        Alert: "<:alert_sign:1451625691664875610>",
        Graph: "<:graph:1445689267861979197>",
        GraphDown: "<:graphdown:1456301332351815823>",
        JobTech: "<:fortuna_engineer:1455563457112969331>",
        JobMedical: "<:fortuna_doctor:1455563555930636331>",
        JobBusiness: "<:fortuna_business:1455564125534031883>",
        JobLegal: "<:fortuna_lawyer:1455564518217351251>",
        JobService: "<:fortuna_coffee:1455565452670664736>",
        JobTrade: "<:fortuna_mechanic:1455568751343960064>",
        JobWorking: "<:fortuna_working:1455570584455872553>",
        JobPromotion: "<:fortuna_mod:1455572710632587368>",
        Monitor: "<:fortuna_engineer:1455563457112969331>",
        Trash: "🗑️",
        Gun: "<:gun:1456729243399753752>",
        // Auto-generated Emojis
        FortunaAngry: "<:fortuna_angry:1454885720316575916>",
        FortunaConfused: "<:fortuna_confused:1454885723072106627>",
        FortunaHeart: "<:fortuna_heart:1454885726121623677>",
        FortunaSad: "<:fortuna_sad:1454885729128812555>",
        FortunaShocked: "<:fortuna_shocked:1454885731611840643>",
        FortunaSparkle: "<:fortuna_sparkle:1454885735818858691>",
        FortunaThink: "<:fortuna_think:1454885738373185743>",
        FortunaMoney: "<:fortuna_money:1454887481924386899>",
        FortunaTeacher: "<:fortuna_teacher:1455068530641862667>",
        FortunaTeacherAngry: "<:fortuna_teacher_angry:1455068668391329843>",
        FortunaTeacherSad: "<:fortuna_teacher_sad:1455072980466929768>",
        FortunaGraduate: "<:fortuna_graduate:1455091834303942729>",
        FortunaGym: "<:fortuna_gym:1455103411866566716>",
        FortunaSports: "<:fortuna_sports:1455103427473440768>",
        FortunaMedidate: "<:fortuna_medidate:1455103880982565008>",
        Tick: "<:tick:1455105986120515656>",
        AlertSign: "<:alert_sign:1455458789934235738>",
        FortunaEngineer: "<:fortuna_engineer:1455563457112969331>",
        FortunaDoctor: "<:fortuna_doctor:1455563555930636331>",
        FortunaBusiness: "<:fortuna_business:1455564125534031883>",
        FortunaLawyer: "<:fortuna_lawyer:1455564518217351251>",
        FortunaCoffee: "<:fortuna_coffee:1455565452670664736>",
        FortunaMechanic: "<:fortuna_mechanic:1455568751343960064>",
        FortunaWorking: "<:fortuna_working:1455570584455872553>",
        FortunaMod: "<:fortuna_mod:1455572710632587368>",
        AdminShield: "<a:admin_shield:1456568693600555069>",
        Banana: "<:banana:1456568699421986826>",
        Bandaid: "<a:bandaid:1456568701737500753>",
        Bank: "<:Bank:1456568703662555136>",
        Bell: "<:bell:1456568705994723503>",
        Bj: "<:bj:1456568708041281579>",
        Blackcoin: "<:Blackcoin:1456568710348275826>",
        Boots: "<a:boots:1456568714592780290>",
        Cards: "<a:cards:1456568716958634034>",
        Casino: "<a:casino:1456568719374553138>",
        Channel: "<:channel:1456568721760845948>",
        Cherry: "<:cherry:1456568724134822040>",
        Clinic: "<:clinic:1456568728883040287>",
        CockfightShield: "<:cockfight_shield:1456568731445629104>",
        Cooldown: "<:cooldown:1456568806741774449>",
        Credit: "<a:credit:1456568809304625192>",
        Delete: "<:Delete:1456568815398813756>",
        Dices: "<a:dices:1456568817621925991>",
        Disable: "<a:disable:1456568820096303318>",
        Dmin: "<:dmin:1456568822340255817>",
        Fast: "<a:fast:1456568826417381501>",
        Gem: "<:Gem:1456568963046576301>",
        Grapes: "<:grapes:1456568965391192130>",
        GraphUp: "<:graph_up:1456568970504048722>",
        Inventory: "<:inventory:1456568973452644383>",
        Lcok: "<:lcok:1456568975688204471>",
        Lootbox: "<a:lootbox:1456568977751801856>",
        Market: "<:market:1456568979815399475>",
        MedalBronze: "<:medal_bronze:1456568982260678738>",
        MedalGold: "<a:medal_gold:1456568984638853150>",
        MedalSilver: "<:medal_silver:1456568987013091421>",
        Medicine: "<:medicine:1456568989340930138>",
        Onloan: "<:onloan:1456568995703689314>",
        Pencil: "<:pencil:1456568999075905651>",
        Police: "<:police:1456569002200535217>",
        Price: "<:price:1456569004889080026>",
        Redcoin: "<:redcoin:1456569008273883176>",
        Redxp: "<:redxp:1456569011105042474>",
        Refresh: "<:refresh:1456569013462106237>",
        Rip: "<:rip:1456569015639212032>",
        Scroll: "<:scroll:1456569017530716254>",
        Settings: "<a:settings:1456569021066641408>",
        Seven: "<:seven:1456569023151083561>",
        Sparks: "<:sparks:1456569026292744303>",
        Spear: "<a:spear:1456569028939354112>",
        Trade: "<:trade:1456569033854812254>",
        University: "<:university:1456569035910156330>",
        Waleltr: "<:waleltr:1456569038497910846>",
        Watermelonm: "<:watermelonm:1456569041094312119>",
        XpEmpty: "<:xp_empty:1456569044315537550>",
        XpFull: "<:xp_full:1456569047758929931>",
    },
    Images: {
        Main: path_1.default.join(process.cwd(), "src", "assets", "fortuna.jpg")
    },
    Colors: {
        Base: "#9B59B6", // Purple-ish to match her hair?
        Success: "#2ECC71", // Green
        Fail: "#E74C3C" // Red
    }
};
function getEmoteUrl(emote) {
    if (!emote)
        return null;
    const match = emote.match(/:(\d+)>/);
    if (match && match[1]) {
        return `https://cdn.discordapp.com/emojis/${match[1]}.png`;
    }
    return null;
}
//# sourceMappingURL=branding.js.map