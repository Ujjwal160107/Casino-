import { GameConfig, EquipmentSlot } from "../config/gameConfig";

export interface StatBonus {
    str: number;
    agi: number;
    def: number;
}

export function getEquipmentSlot(itemName: string): EquipmentSlot | null {
    const name = itemName.toLowerCase();

    // Weapon Keywords
    if (name.includes("spur") || name.includes("sword") || name.includes("blade") || name.includes("talon") || name.includes("spear")) {
        return GameConfig.EquipmentSlots.WEAPON;
    }

    // Armor Keywords
    if (name.includes("armor") || name.includes("shield") || name.includes("vest") || name.includes("helmet")) {
        return GameConfig.EquipmentSlots.ARMOR;
    }

    // Accessory Keywords
    if (name.includes("glove") || name.includes("boot") || name.includes("ring") || name.includes("amulet") || name.includes("charm")) {
        return GameConfig.EquipmentSlots.ACCESSORY;
    }

    return null;
}

const NAMED_EQUIPMENT_BONUSES: Record<string, StatBonus> = {
    "iron spurs": { str: 3, agi: 0, def: 0 },
    "guard vest": { str: 0, agi: 0, def: 4 },
};

export function getEquipmentBonuses(itemName: string | undefined): StatBonus {
    if (!itemName) return { str: 0, agi: 0, def: 0 };
    const name = itemName.toLowerCase();

    const named = NAMED_EQUIPMENT_BONUSES[name];
    if (named) return { ...named };

    const bonus = { str: 0, agi: 0, def: 0 };

    // --- Material Bonuses ---
    // Higher grade materials give flat bonus to all valid stats for that item
    let materialBonus = 0;
    if (name.includes("wood") || name.includes("leather")) materialBonus = 0;
    else if (name.includes("stone") || name.includes("chain")) materialBonus = 1;
    else if (name.includes("iron")) materialBonus = 2;
    else if (name.includes("gold")) materialBonus = 3;
    else if (name.includes("diamond")) materialBonus = 5;
    else if (name.includes("netherite")) materialBonus = 8;
    else if (name.includes("emerald")) materialBonus = 10;

    // --- Base Item Stats ---

    // Weapons (Str focus)
    if (name.includes("spur")) bonus.str += (1 + materialBonus);
    if (name.includes("spear")) bonus.str += (2 + materialBonus); // Spears like swords but no Agi penalty? Or maybe slight agi penalty? Let's just give it raw str.
    if (name.includes("sword")) { bonus.str += (2 + materialBonus); bonus.agi -= 1; }
    if (name.includes("blade")) bonus.str += (1 + materialBonus);
    if (name.includes("scythe")) { bonus.str += (3 + materialBonus); bonus.def -= 2; }

    // Armor (Def focus)
    if (name.includes("armor") || name.includes("vest") || name.includes("plate")) bonus.def += (2 + materialBonus);
    if (name.includes("shield")) bonus.def += (1 + materialBonus);
    if (name.includes("helmet")) bonus.def += (1 + Math.floor(materialBonus / 2)); // Helmets give less

    // Accessories (Agi focus or Utility)
    if (name.includes("glove")) { bonus.agi += (1 + Math.floor(materialBonus / 2)); bonus.str += 1; }
    if (name.includes("boot")) bonus.agi += (2 + Math.floor(materialBonus / 2));
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

export function getTraitBonus(trait: string | undefined): StatBonus {
    if (!trait) return { str: 0, agi: 0, def: 0 };
    const t = trait.toLowerCase();
    if (t === "aggressive") return { str: 2, agi: 0, def: -1 };
    if (t === "tank") return { str: 0, agi: -1, def: 2 };
    if (t === "speedster") return { str: -1, agi: 2, def: 0 };
    if (t === "balanced") return { str: 1, agi: 1, def: 1 };
    if (t === "fierce") return { str: 3, agi: 0, def: -2 };
    return { str: 0, agi: 0, def: 0 };
}

export function calculateTotalStats(baseStats: StatBonus, trait: string | undefined, equipmentNames: string[]): StatBonus {
    const traitBonus = getTraitBonus(trait);

    let totalStr = baseStats.str + traitBonus.str;
    let totalAgi = baseStats.agi + traitBonus.agi;
    let totalDef = baseStats.def + traitBonus.def;

    for (const item of equipmentNames) {
        if (!item) continue;
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

export function calculateCombatScore(level: number, stats: StatBonus): number {
    return (100 + (level * GameConfig.BaseStats.LevelMultiplier)) +
        (stats.str * GameConfig.BaseStats.StrWeight) +
        (stats.def * GameConfig.BaseStats.DefWeight) +
        (stats.agi * GameConfig.BaseStats.AgiWeight);
}

export function getWinChance(myScore: number, enemyScore: number): number {
    const total = myScore + enemyScore;
    if (total === 0) return 50;
    return (myScore / total) * 100;
}

import { GAME_BET_LIMITS } from "./economyConfig";

export function getGameBetLimits(gameKey: string): { min: number; max: number } {
    const perGame = GAME_BET_LIMITS.perGameMax as Record<string, number | undefined>;
    return {
        min: GAME_BET_LIMITS.defaultMin,
        max: perGame[gameKey] ?? GAME_BET_LIMITS.defaultMax,
    };
}
