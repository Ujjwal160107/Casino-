import { Interaction } from "discord.js";

export async function handleMarketInteraction(interaction: Interaction) {
  // V2 Black Market interactions are handled via the collector in market.ts
  // This handler is kept for backward compatibility with any lingering V1 button IDs
  return;
}
