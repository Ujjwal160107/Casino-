"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getEquipmentSlot = getEquipmentSlot;
exports.getEquipmentBonuses = getEquipmentBonuses;
exports.getTraitBonus = getTraitBonus;
exports.calculateTotalStats = calculateTotalStats;
exports.calculateCombatScore = calculateCombatScore;
exports.getWinChance = getWinChance;
exports.getGameBetLimits = getGameBetLimits;
const gameConfig_1 = require("../config/gameConfig");
function getEquipmentSlot(itemName) {
    const name = itemName.toLowerCase();
    // Weapon Keywords
    if (name.includes("spur") || name.includes("sword") || name.includes("blade") || name.includes("talon") || name.includes("spear")) {
        return gameConfig_1.GameConfig.EquipmentSlots.WEAPON;
    }
    // Armor Keywords
    if (name.includes("armor") || name.includes("shield") || name.includes("vest") || name.includes("helmet")) {
        return gameConfig_1.GameConfig.EquipmentSlots.ARMOR;
    }
    // Accessory Keywords
    if (name.includes("glove") || name.includes("boot") || name.includes("ring") || name.includes("amulet") || name.includes("charm")) {
        return gameConfig_1.GameConfig.EquipmentSlots.ACCESSORY;
    }
    return null;
}
function getEquipmentBonuses(itemName) {
    if (!itemName)
        return { str: 0, agi: 0, def: 0 };
    const name = itemName.toLowerCase();
    const bonus = { str: 0, agi: 0, def: 0 };
    // --- Material Bonuses ---
    // Higher grade materials give flat bonus to all valid stats for that item
    let materialBonus = 0;
    if (name.includes("wood") || name.includes("leather"))
        materialBonus = 0;
    else if (name.includes("stone") || name.includes("chain"))
        materialBonus = 1;
    else if (name.includes("iron"))
        materialBonus = 2;
    else if (name.includes("gold"))
        materialBonus = 3;
    else if (name.includes("diamond"))
        materialBonus = 5;
    else if (name.includes("netherite"))
        materialBonus = 8;
    else if (name.includes("emerald"))
        materialBonus = 10;
    // --- Base Item Stats ---
    // Weapons (Str focus)
    if (name.includes("spur"))
        bonus.str += (1 + materialBonus);
    if (name.includes("spear"))
        bonus.str += (2 + materialBonus); // Spears like swords but no Agi penalty? Or maybe slight agi penalty? Let's just give it raw str.
    if (name.includes("sword")) {
        bonus.str += (2 + materialBonus);
        bonus.agi -= 1;
    }
    if (name.includes("blade"))
        bonus.str += (1 + materialBonus);
    if (name.includes("scythe")) {
        bonus.str += (3 + materialBonus);
        bonus.def -= 2;
    }
    // Armor (Def focus)
    if (name.includes("armor") || name.includes("vest") || name.includes("plate"))
        bonus.def += (2 + materialBonus);
    if (name.includes("shield"))
        bonus.def += (1 + materialBonus);
    if (name.includes("helmet"))
        bonus.def += (1 + Math.floor(materialBonus / 2)); // Helmets give less
    // Accessories (Agi focus or Utility)
    if (name.includes("glove")) {
        bonus.agi += (1 + Math.floor(materialBonus / 2));
        bonus.str += 1;
    }
    if (name.includes("boot"))
        bonus.agi += (2 + Math.floor(materialBonus / 2));
    if (name.includes("ring")) {
        // Rings are special, material adds generally
        bonus.str += Math.ceil(materialBonus / 2);
        bonus.agi += Math.ceil(materialBonus / 2);
    }
    if (name.includes("amulet")) {
        bonus.def += Math.ceil(materialBonus / 2);
        bonus.str += Math.ceil(materialBonus / 2);
    }
    return bonus;
}
function getTraitBonus(trait) {
    if (!trait)
        return { str: 0, agi: 0, def: 0 };
    const t = trait.toLowerCase();
    if (t === "aggressive")
        return { str: 2, agi: 0, def: -1 };
    if (t === "tank")
        return { str: 0, agi: -1, def: 2 };
    if (t === "speedster")
        return { str: -1, agi: 2, def: 0 };
    if (t === "balanced")
        return { str: 1, agi: 1, def: 1 };
    if (t === "fierce")
        return { str: 3, agi: 0, def: -2 };
    return { str: 0, agi: 0, def: 0 };
}
function calculateTotalStats(baseStats, trait, equipmentNames) {
    const traitBonus = getTraitBonus(trait);
    let totalStr = baseStats.str + traitBonus.str;
    let totalAgi = baseStats.agi + traitBonus.agi;
    let totalDef = baseStats.def + traitBonus.def;
    for (const item of equipmentNames) {
        if (!item)
            continue;
        const equipBonus = getEquipmentBonuses(item);
        totalStr += equipBonus.str;
        totalAgi += equipBonus.agi;
        totalDef += equipBonus.def;
    }
    return {
        str: Math.max(0, totalStr),
        agi: Math.max(0, totalAgi),
        def: Math.max(0, totalDef)
    };
}
function calculateCombatScore(level, stats) {
    return (100 + (level * gameConfig_1.GameConfig.BaseStats.LevelMultiplier)) +
        (stats.str * gameConfig_1.GameConfig.BaseStats.StrWeight) +
        (stats.def * gameConfig_1.GameConfig.BaseStats.DefWeight) +
        (stats.agi * gameConfig_1.GameConfig.BaseStats.AgiWeight);
}
function getWinChance(myScore, enemyScore) {
    const total = myScore + enemyScore;
    if (total === 0)
        return 50;
    return (myScore / total) * 100;
}
function getGameBetLimits(config, gameKey) {
    const limits = config.gameBetLimits || {};
    const gameLimits = limits[gameKey] || {};
    const globalMin = config.minBet || 100;
    const globalMax = config.maxBet || 100000;
    return {
        min: typeof gameLimits.min === "number" ? gameLimits.min : globalMin,
        max: typeof gameLimits.max === "number" ? gameLimits.max : globalMax
    };
}
//# sourceMappingURL=gameUtils.js.map