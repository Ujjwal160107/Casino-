import type { ModuleDoc } from "../types";
import gettingStarted from "./getting-started";
import economy from "./economy";
import bankAndCredit from "./bank-and-credit";
import casino from "./casino";

export const MODULE_DOCS: ModuleDoc[] = [
  gettingStarted,
  economy,
  bankAndCredit,
  casino,
];

export function getModuleDoc(slug: string): ModuleDoc | undefined {
  return MODULE_DOCS.find((m) => m.slug === slug);
}
