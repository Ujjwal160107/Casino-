"use client";

import { useSyncExternalStore } from "react";

/**
 * The wall clock, refreshed every 30 seconds. Reads 0 on the server and during
 * hydration, so anything derived from it renders after mount and never
 * mismatches the server HTML.
 */
let now = 0;
const TICK_MS = 30_000;

function subscribe(onChange: () => void) {
  now = Date.now();
  const id = setInterval(() => { now = Date.now(); onChange(); }, TICK_MS);
  return () => clearInterval(id);
}

export function useNow() {
  return useSyncExternalStore(subscribe, () => now, () => 0);
}
