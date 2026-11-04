// TURF_ROUTES: the `turf:` route table. Empty until plan 3 (Turf) adds its
// entries, each with a scope and ack; the router runs the owner check and the
// ack, so an entry never checks the owner itself. Until then every `turf:`
// press answers "Turf wars open soon.".
import type { CfRouteTable } from "./crimeFamilyRouter";

export const TURF_ROUTES: CfRouteTable = {};
