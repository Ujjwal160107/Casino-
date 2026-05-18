import path from "path";

export const Mascot = {
    Name: "Lady Fortuna",
    Emotes: {
        Success: "<:fortuna_sparkle:1503284615878807605>",
        Fail: "<:fortuna_sad:1503284606860922901>",
        Confused: "<:fortuna_confused:1503284599453650974>",
        Angry: "<:fortuna_angry:1503284595599347761>",
        Think: "<:fortuna_think:1503284619410280448>",
        Shocked: "<:fortuna_shocked:1503284611793420349>",
        Love: "<:fortuna_heart:1503284603287375882>",
        Money: "<:fortuna_money:1503284623034028095>",
        Currency: "<:fortunes:1503253856992366612>",
        Teacher: "<:fortuna_teacher:1503284626326683650>",
        TeacherAngry: "<:fortuna_teacher_angry:1503284630571454475>",
        TeacherSad: "<:fortuna_teacher_sad:1503284634925006859>",
        Graduate: "<:fortuna_graduate:1503284638712332360>",
        MoneyBag: "<:MoneyBag:1446970451606896781>",
        Meditation: "<:fortuna_medidate:1503284650137747589>",
        Sports: "<:fortuna_sports:1503284646346231879>",
        Gym: "<:fortuna_gym:1503284642059522074>",
        Accept: "<:n_check:1451281806279311435>",
        Decline: "<a:decline:1455106146120761492>",
        Chicken: "<:cock:1451281426329768172>",
        Alert: "<:alert_sign:1451625691664875610>",
        Graph: "<:graph:1445689267861979197>",
        GraphDown: "<:graphdown:1456301332351815823>",
        JobTech: "<:fortuna_engineer:1503284675605696643>",
        JobMedical: "<:fortuna_doctor:1503284678709346459>",
        JobBusiness: "<:fortuna_business:1503284682756853872>",
        JobLegal: "<:fortuna_lawyer:1503284686388985938>",
        JobService: "<:fortuna_coffee:1503284690352869436>",
        JobTrade: "<:fortuna_mechanic:1503284695062937692>",
        JobWorking: "<:fortuna_working:1503284698913443890>",
        JobPromotion: "<:fortuna_mod:1503284703317196831>",
        Monitor: "<:fortuna_engineer:1503284675605696643>",
        Trash: "🗑️",
        Gun: "<:gun:1503285038752469133>",

        // Auto-generated Emojis
        FortunaAngry: "<:fortuna_angry:1503284595599347761>",
        FortunaConfused: "<:fortuna_confused:1503284599453650974>",
        FortunaHeart: "<:fortuna_heart:1503284603287375882>",
        FortunaSad: "<:fortuna_sad:1503284606860922901>",
        FortunaShocked: "<:fortuna_shocked:1503284611793420349>",
        FortunaSparkle: "<:fortuna_sparkle:1503284615878807605>",
        FortunaThink: "<:fortuna_think:1503284619410280448>",
        FortunaMoney: "<:fortuna_money:1503284623034028095>",
        FortunaTeacher: "<:fortuna_teacher:1503284626326683650>",
        FortunaTeacherAngry: "<:fortuna_teacher_angry:1503284630571454475>",
        FortunaTeacherSad: "<:fortuna_teacher_sad:1503284634925006859>",
        FortunaGraduate: "<:fortuna_graduate:1503284638712332360>",
        FortunaGym: "<:fortuna_gym:1503284642059522074>",
        FortunaSports: "<:fortuna_sports:1503284646346231879>",
        FortunaMedidate: "<:fortuna_medidate:1503284650137747589>",
        Tick: "<:tick:1503284654281850951>",
        AlertSign: "<:alert_sign:1503284671537086644>",
        FortunaEngineer: "<:fortuna_engineer:1503284675605696643>",
        FortunaDoctor: "<:fortuna_doctor:1503284678709346459>",
        FortunaBusiness: "<:fortuna_business:1503284682756853872>",
        FortunaLawyer: "<:fortuna_lawyer:1503284686388985938>",
        FortunaCoffee: "<:fortuna_coffee:1503284690352869436>",
        FortunaMechanic: "<:fortuna_mechanic:1503284695062937692>",
        FortunaWorking: "<:fortuna_working:1503284698913443890>",
        FortunaMod: "<:fortuna_mod:1503284703317196831>",
        AdminShield: "<a:admin_shield:1456568693600555069>",
        Banana: "<:banana:1503284719209676912>",
        Bandaid: "<a:bandaid:1456568701737500753>",
        Bank: "<:Bank:1503284735873646602>",
        Bell: "<:bell:1503284739757441034>",
        Bj: "<:bj:1503284744165527603>",
        Blackcoin: "<:Blackcoin:1503284748359962634>",
        Boots: "<a:boots:1456568714592780290>",
        Cards: "<a:cards:1456568716958634034>",
        Casino: "<a:casino:1456568719374553138>",
        Channel: "<:channel:1503284789023604868>",
        Cherry: "<:cherry:1503284793108860988>",
        Clinic: "<:clinic:1503284800960598027>",
        CockfightShield: "<:cockfight_shield:1503284805058433084>",
        Cooldown: "<:cooldown:1503284808816656436>",
        Credit: "<a:credit:1456568809304625192>",
        Delete: "<:Delete:1503284825249939532>",
        Dices: "<a:dices:1456568817621925991>",
        Disable: "<a:disable:1456568820096303318>",
        Dmin: "<:dmin:1503284853687451708>",
        Fast: "<a:fast:1456568826417381501>",
        Gem: "<:Gem:1503284869147398176>",
        Grapes: "<:grapes:1503284873371189288>",
        GraphUp: "<:graph_up:1503284881843683338>",
        Inventory: "<:inventory:1503284885727740006>",
        Lock: "<:lock:1503284889535905942>",
        Lootbox: "<a:lootbox:1456568977751801856>",
        Market: "<:market:1503284905315008592>",
        MedalBronze: "<:medal_bronze:1503284909471436860>",
        MedalGold: "<a:medal_gold:1456568984638853150>",
        MedalSilver: "<:medal_silver:1503284925644673074>",
        Medicine: "<:medicine:1503284929335656618>",
        Onloan: "<:onloan:1503284937447440496>",
        Pencil: "<:pencil:1503284940895420511>",
        Police: "<:police:1503284945840504914>",
        Price: "<:price:1503284949870968882>",
        Redcoin: "<:redcoin:1503284953285132319>",
        Redxp: "<:redxp:1503284957072850976>",
        Refresh: "<:refresh:1503284960973553757>",
        Rip: "<:rip:1503284965000089600>",
        Scroll: "<:scroll:1503284968925827152>",
        Settings: "<a:settings:1456569021066641408>",
        Seven: "<:seven:1503284985225023569>",
        Sparks: "<:sparks:1503284989813329972>",
        Spear: "<a:spear:1456569028939354112>",
        Trade: "<:trade:1503285006330630257>",
        University: "<:university:1503285010344706189>",
        Waleltr: "<:waleltr:1503285014408855562>",
        Watermelonm: "<:watermelonm:1503285024462602331>",
        XpEmpty: "<:xp_empty:1503285028753375342>",
        XpFull: "<:xp_full:1503285034893840454>",
        Shop: "<:market:1503284905315008592>",
        Stonks: "<:graph_up:1503284881843683338>",
    },
    Images: {
        Main: path.join(process.cwd(), "src", "assets", "guide_banner.png")
    },
    Colors: {
        Base: "#9B59B6", // Purple-ish to match her hair?
        Success: "#2ECC71", // Green
        Fail: "#E74C3C" // Red
    },
    Links: {
        Dashboard: "https://fortunabot.dev/",
        Support: "https://discord.gg/sK66U3vx6S",
        Docs: "https://fortunabot.dev/docs",
        CommandList: "http://fortunabot.dev/docs/commands"
    }
};

export const AnimalEmojis: Record<string, string> = {
  rabbit:       "<:rabbit:1505596960416202842>",
  squirrel:     "<:squirel:1505597073695965324>",
  fox:          "<:fox:1505596829994061924>",
  duck:         "<:duck:1505596804253876294>",
  deer:         "<:deer:1505596802332884993>",
  boar:         "<:boar:1505596756577226812>",
  wolf:         "<:wolf:1505597021061644438>",
  eagle:        "<:eagle:1505596806401102046>",
  black_bear:   "<:bear:1505596742144622602>",
  snow_leopard: "<:snowleopard:1505597071502082200>",
  crocodile:    "<:crocodile:1505596777573912646>",
  python:       "<:python:1505596912273981480>",
  white_tiger:  "<:whitetiger:1505597018830278786>",
  komodo_dragon:"<:komododragonm:1505596910038286386>",
  arctic_wolf:  "<:articwolf:1505596726185033900>",
  golden_eagle: "<:goldeneagle:1505596855600283810>",
};

export const GLOBAL_CURRENCY_NAME = "Fortunes";
export const GLOBAL_CURRENCY_EMOJI = Mascot.Emotes.Currency;

export function getEmoteUrl(emote: string): string | null {
    if (!emote) return null;
    const isAnimated = emote.startsWith("<a:");
    const match = emote.match(/:(\d+)>/);
    if (match && match[1]) {
        const ext = isAnimated ? "gif" : "png";
        return `https://cdn.discordapp.com/emojis/${match[1]}.${ext}`;
    }
    return null;
}
