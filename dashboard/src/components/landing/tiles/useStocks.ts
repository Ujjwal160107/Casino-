"use client";

import { useEffect, useState } from "react";
import type { StockSeries } from "@/app/api/stocks/route";

export type { StockSeries };

export type MarketState = { status: "loading" } | { status: "error" } | { status: "ready"; stocks: StockSeries[] };

const REFRESH_MS = 60_000;

async function fetchMarket(signal: AbortSignal): Promise<StockSeries[]> {
  const res = await fetch("/api/stocks", { signal });
  if (!res.ok) throw new Error(`market ${res.status}`);
  const body: unknown = await res.json();
  const stocks = (body as { stocks?: unknown }).stocks;
  if (!Array.isArray(stocks) || stocks.length === 0) throw new Error("market empty");
  return stocks as StockSeries[];
}

/**
 * The live market from /api/stocks: fetched on mount and every minute while
 * the tab is visible. A failed refresh keeps the last good prices; only a
 * market that never loaded shows the error state. `retry` refetches from scratch.
 */
export function useStocks() {
  const [state, setState] = useState<MarketState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    let current: AbortController | null = null;
    const load = () => {
      current?.abort();
      const ctrl = new AbortController();
      current = ctrl;
      fetchMarket(ctrl.signal).then(
        (stocks) => { if (alive) setState({ status: "ready", stocks }); },
        () => { if (alive && !ctrl.signal.aborted) setState((s) => (s.status === "ready" ? s : { status: "error" })); },
      );
    };
    load();
    const id = setInterval(() => { if (!document.hidden) load(); }, REFRESH_MS);
    return () => { alive = false; clearInterval(id); current?.abort(); };
  }, [attempt]);

  const retry = () => {
    setState({ status: "loading" });
    setAttempt((a) => a + 1);
  };

  return [state, retry] as const;
}
