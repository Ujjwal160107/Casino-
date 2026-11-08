"use client";

import { useId, useRef, useState, type KeyboardEvent } from "react";
import { btn } from "@/components/landing/kit";
import { cn } from "@/lib/utils";
import { formatPrice, formatSpan, priceChange, updatedAgo } from "./format";
import { StockChart, type PricePoint } from "./StockChart";
import { Tile } from "./Tile";
import { useNow } from "./useNow";
import { useStocks, type StockSeries } from "./useStocks";

const TICK_MS = 30 * 60_000;

/** The chart's points: recorded ticks (plus the current price if it is newer), or previous → current while history is short. */
function chartSeries(s: StockSeries): { points: PricePoint[]; span: string; short: boolean } {
  const updated = Date.parse(s.updatedAt);
  let points = s.points.filter((p) => Number.isFinite(p.price) && !Number.isNaN(Date.parse(p.at)));
  const last = points[points.length - 1];
  if (last && updated - Date.parse(last.at) > 60_000 && last.price !== s.price) points = [...points, { at: s.updatedAt, price: s.price }];
  if (points.length >= 2) return { points, span: formatSpan(Date.parse(points[points.length - 1].at) - Date.parse(points[0].at)), short: false };
  const fallback = s.previous > 0 ? [{ at: new Date(updated - TICK_MS).toISOString(), price: s.previous }, { at: s.updatedAt, price: s.price }] : [{ at: s.updatedAt, price: s.price }];
  return { points: fallback, span: "Last tick", short: true };
}

/** The market: live prices from /api/stocks, one tab per ticker, with a real price history chart. */
export function LiveStockTile() {
  const [market, retry] = useStocks();
  return (
    <Tile kicker="Investments · !stock" title="The market." copy="Live prices from the bot. Every server trades on the same market.">
      {market.status === "loading" && <MarketSkeleton />}
      {market.status === "error" && (
        <div className="mt-auto grid justify-items-start gap-4 py-6">
          <p className="font-display text-3xl font-black uppercase leading-none">The market is unavailable right now.</p>
          <button type="button" onClick={retry} className={cn(btn.base, btn.ghost)}>Retry</button>
        </div>
      )}
      {market.status === "ready" && <Market stocks={market.stocks} />}
    </Tile>
  );
}

function Market({ stocks }: { stocks: StockSeries[] }) {
  const id = useId();
  const now = useNow();
  const [selected, setSelected] = useState(stocks[0].symbol);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const index = Math.max(0, stocks.findIndex((s) => s.symbol === selected));
  const stock = stocks[index];
  const change = priceChange(stock.price, stock.previous);
  const series = chartSeries(stock);
  const ago = updatedAgo(stock.updatedAt, now);

  function onKeyDown(e: KeyboardEvent) {
    const n = stocks.length;
    const next = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: n - 1 }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const i = (next + n) % n;
    setSelected(stocks[i].symbol);
    tabs.current[i]?.focus();
  }

  const first = series.points[0];
  const lastPoint = series.points[series.points.length - 1];
  const chartLabel = `${stock.symbol} price, ${series.span.toLowerCase()}: from ${formatPrice(first.price)} to ${formatPrice(lastPoint.price)}`;

  return (
    <>
      <div role="tablist" aria-label="Stocks" onKeyDown={onKeyDown} className="flex flex-wrap gap-2">
        {stocks.map((s, i) => (
          <button
            key={s.symbol}
            ref={(el) => { tabs.current[i] = el; }}
            id={`${id}-tab-${i}`}
            type="button"
            role="tab"
            aria-selected={i === index}
            aria-controls={`${id}-panel`}
            tabIndex={i === index ? 0 : -1}
            onClick={() => setSelected(s.symbol)}
            className={cn(
              "min-h-11 rounded-full border-2 px-4 font-mono text-[13px] font-bold transition-colors",
              i === index ? "border-ink bg-ink text-bg" : "border-line-2 text-ink hover:border-ink",
            )}
          >
            {s.symbol}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-tab-${index}`} className="mt-2 grid gap-4">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 text-ink-2">
              {stock.name}
              {stock.status === "DELISTING" && (
                <span className="rounded-full border-2 border-ink px-2 font-mono text-[11px] font-bold uppercase tracking-[.1em]">Delisting · sell only</span>
              )}
            </p>
            <div aria-live="polite" aria-atomic="true" className="flex flex-wrap items-baseline gap-x-4">
              <b className="font-display text-[clamp(44px,5vw,60px)] font-black leading-none tabular-nums">{formatPrice(stock.price)}</b>
              {change && (
                <span className={cn("font-mono text-[15px] font-bold tabular-nums", change.up ? "text-gold" : "text-muted")}>
                  <span aria-hidden>{change.up ? "▲" : "▼"} </span>
                  <span className="sr-only">{change.up ? "Up" : "Down"} </span>
                  {change.text} this tick
                </span>
              )}
            </div>
          </div>
          <p className="font-mono text-xs font-bold uppercase tracking-[.12em] text-muted">{series.span}</p>
        </div>
        <StockChart points={series.points} label={chartLabel} />
        {series.short && <p className="font-mono text-xs text-muted">History builds up every 30 minutes.</p>}
      </div>
      <p className="mt-auto border-t-[1.5px] border-line pt-3 font-mono text-xs text-muted">
        {ago ? `${ago} · the market ticks every 30 minutes` : "The market ticks every 30 minutes"}
      </p>
    </>
  );
}

/** Same layout as the loaded market, in flat placeholder blocks (no animation). */
function MarketSkeleton() {
  return (
    <div aria-busy="true" className="grid gap-4">
      <span className="sr-only">Loading the market</span>
      <div aria-hidden className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4].map((i) => <span key={i} className="h-11 w-20 rounded-full bg-panel-2" />)}
      </div>
      <div aria-hidden className="grid gap-2">
        <span className="h-5 w-40 rounded bg-panel-2" />
        <span className="h-14 w-56 rounded bg-panel-2" />
      </div>
      <span aria-hidden className="h-[180px] rounded-lg bg-panel-2 sm:h-[220px]" />
      <span aria-hidden className="h-4 w-64 max-w-full rounded bg-panel-2" />
    </div>
  );
}
