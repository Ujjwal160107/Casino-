// The size rules of a family (amendment 2.2, 3.2): pure functions of the
// member count or the level, every number from CRIME_FAMILY_CONFIG.
import { CRIME_FAMILY_CONFIG } from "../../utils/economyConfig";
import { levelDef } from "../../data/crimeFamilyCatalog";

/** Crew heists a family may start per rolling 24 h. */
export function heistCapFor(memberCount: number): number {
  return Math.max(CRIME_FAMILY_CONFIG.heistCapMin, Math.ceil(memberCount / CRIME_FAMILY_CONFIG.heistCapDivisor));
}

/** Capo seats a family of this size holds. */
export function capoCapFor(memberCount: number): number {
  return Math.max(1, Math.floor(memberCount / CRIME_FAMILY_CONFIG.capoPerMembers));
}

/** Members at underInvestigationHeat that put the family under investigation. */
export function investigationThresholdFor(memberCount: number): number {
  return Math.max(CRIME_FAMILY_CONFIG.underInvestigationMembers, Math.ceil(memberCount / CRIME_FAMILY_CONFIG.investigationDivisor));
}

/** Accepted joins a family of this level may take per rolling 7 days. */
export function joinsPerFamilyFor(level: number): number {
  return Math.max(CRIME_FAMILY_CONFIG.joinsPerFamilyPer7dMin, Math.ceil(levelDef(level).memberCap / CRIME_FAMILY_CONFIG.joinsPerFamilyDivisor));
}
