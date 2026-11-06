// Shared walkers for the ComponentsV2 layout tests: component count, visible
// characters and a depth-first visit of a payload's JSON.
import type { CfPayload } from "../../src/ui/crimeFamily/kit";

export const count = (n: any): number => 1 + (n.components ?? []).reduce((s: number, c: any) => s + count(c), 0) + (n.accessory ? 1 : 0);
export const chars = (n: any): number => (typeof n.content === "string" ? n.content.length : 0) + (n.components ?? []).reduce((s: number, c: any) => s + chars(c), 0) + (n.accessory ? chars(n.accessory) : 0);
export const walk = (n: any, f: (x: any) => void) => { f(n); (n.components ?? []).forEach((c: any) => walk(c, f)); };

/** Every component of the payload, as Discord counts them toward the 40 cap. */
export const countComponents = (p: CfPayload): number => p.components.reduce((s, c) => s + count(c.toJSON()), 0);
