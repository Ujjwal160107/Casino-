"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameConfig = void 0;
exports.GameConfig = {
    Emojis: {
        Chicken: "<:cock:1451281426329768172>",
        Win: "<:MoneyBag:1446970451606896781>",
        Rip: "<:rip:1451287136132403303>",
        Tick: "<:tick:1455105986120515656>",
        Cooldown: "<:cooldown:1454025354631970826>",
        Clinic: "<:clinic:1453972244610154507>",
        Medicine: "<:medicine:1453973645675200727>",
        Bandaid: "<a:bandaid:1453972442300154018>",
        XpFull: "<:xpfull:1451636569982111765>",
        XpEmpty: "<:xpempty:1451642829427314822>",
        RedBar: "<:Red_Bar:1454017024346034176>",
        Trophy: "🏆",
        Rank1: "🥇",
        Rank2: "🥈",
        Rank3: "🥉",
        MenuSpear: "<a:Spear:1454552210569691239>",
        MenuShield: "<:shieldd:1454552308720341155>",
        MenuBoots: "<a:boots:1454552355512258622>"
    },
    BaseStats: {
        LevelMultiplier: 10, // Score = 100 + (Level * 10)
        StrWeight: 5,
        DefWeight: 3,
        AgiWeight: 3,
    },
    EquipmentSlots: {
        WEAPON: "weapon",
        ARMOR: "armor",
        ACCESSORY: "accessory"
    },
    PredefinedItems: [
        // Weapons
        { name: "Iron Spear", type: "weapon", description: "A simple iron spear. +4 Str.", defaultPrice: 500 },
        { name: "Gold Spear", type: "weapon", description: "Shiny but soft. +5 Str, -1 Def.", defaultPrice: 1500 },
        { name: "Diamond Spear", type: "weapon", description: "Sharp and durable. +7 Str.", defaultPrice: 5000 },
        { name: "Netherite Spear", type: "weapon", description: "Forged in hellfire. +10 Str.", defaultPrice: 15000 },
        // Armor
        { name: "Iron Armor", type: "armor", description: "Basic protection. +4 Def.", defaultPrice: 500 },
        { name: "Gold Armor", type: "armor", description: "Ceremonial armor. +5 Def.", defaultPrice: 1500 },
        { name: "Diamond Armor", type: "armor", description: "Heavy duty protection. +7 Def.", defaultPrice: 5000 },
        { name: "Netherite Armor", type: "armor", description: "Ultimate defense. +10 Def.", defaultPrice: 15000 },
        // Accessories (Boots)
        { name: "Leather Boots", type: "accessory", description: "Lightweight. +2 Agi.", defaultPrice: 200 },
        { name: "Iron Boots", type: "accessory", description: "Sturdy but heavy. +3 Agi.", defaultPrice: 500 }, // Logic might penalty speed? Nah keep simple.
        { name: "Diamond Boots", type: "accessory", description: "Flashy kicks. +5 Agi.", defaultPrice: 5000 },
        { name: "Netherite Boots", type: "accessory", description: "Gravity defying. +8 Agi.", defaultPrice: 15000 },
        // Other Accessories
        { name: "Golden Ring", type: "accessory", description: "A lucky charm. +2 Str, +2 Agi.", defaultPrice: 3000 },
    ]
};
//# sourceMappingURL=gameConfig.js.map