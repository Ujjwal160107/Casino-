// CAPER_ROUTES: the `cpr:` route table. Empty until plan 2 (Capers) adds its
// entries, each with a scope and ack; the router runs the owner check and the
// ack, so an entry never checks the owner itself. Until then every `cpr:`
// press (the S2 Caper button) answers "Capers open soon.".
import type { CfRouteTable } from "./crimeFamilyRouter";

export const CAPER_ROUTES: CfRouteTable = {};
