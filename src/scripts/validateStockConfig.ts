// src/scripts/validateStockConfig.ts
import { validateStockConfig } from "../config/stockConfig";

const errors = validateStockConfig();
if (errors.length > 0) {
  console.error("Stock config validation FAILED:");
  for (const e of errors) console.error("  -", e);
  process.exit(1);
}
console.log("Stock config validation passed.");
