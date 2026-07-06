import type { ModuleDoc } from "../types";
import gettingStarted from "./getting-started";
import economy from "./economy";
import bankAndCredit from "./bank-and-credit";
import casino from "./casino";
import jobsAndCareers from "./jobs-and-careers";
import education from "./education";
import itemsAndShop from "./items-and-shop";
import huntingAndAnimals from "./hunting-and-animals";
import investments from "./investments";
import lifeAndSocial from "./life-and-social";

export const MODULE_DOCS: ModuleDoc[] = [
  gettingStarted,
  economy,
  bankAndCredit,
  casino,
  jobsAndCareers,
  education,
  itemsAndShop,
  huntingAndAnimals,
  investments,
  lifeAndSocial,
];

export function getModuleDoc(slug: string): ModuleDoc | undefined {
  return MODULE_DOCS.find((m) => m.slug === slug);
}
