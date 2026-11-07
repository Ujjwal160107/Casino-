import { formatPrice } from "./format";

/** A price line over time: gold line, matching gold area, faint grid, the latest point emphasised. Pure SVG, no fake data. */
export type PricePoint = { at: string; price: number };

const W = 600;
const H = 200;
const PAD_Y = 14;
const GRID = [0, 1, 2, 3].map((k) => PAD_Y + (k * (H - 2 * PAD_Y)) / 3);

function geometry(points: PricePoint[]) {
  const prices = points.map((p) => p.price);
  let lo = Math.min(...prices);
  let hi = Math.max(...prices);
  if (hi === lo) {
    const d = Math.abs(hi) * 0.01 || 1;
    lo -= d;
    hi += d;
  }
  const times = points.map((p) => Date.parse(p.at));
  const t0 = times[0];
  const span = times[times.length - 1] - t0;
  const xy = points.map((p, i) => [
    span > 0 ? ((times[i] - t0) / span) * W : points.length > 1 ? (i / (points.length - 1)) * W : W,
    PAD_Y + (1 - (p.price - lo) / (hi - lo)) * (H - 2 * PAD_Y),
  ]);
  const line = xy.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
  const area = `${line} L${xy[xy.length - 1][0].toFixed(1)} ${H} L${xy[0][0].toFixed(1)} ${H} Z`;
  const [lx, ly] = xy[xy.length - 1];
  return { line, area, last: { left: (lx / W) * 100, top: (ly / H) * 100 }, high: Math.max(...prices), low: Math.min(...prices) };
}

export function StockChart({ points, label }: { points: PricePoint[]; label: string }) {
  const g = geometry(points);
  return (
    <div>
      <div className="relative h-[180px] sm:h-[220px]">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={label} className="absolute inset-0 size-full overflow-visible">
          {GRID.map((y) => (
            <line key={y} x1={0} x2={W} y1={y} y2={y} className="stroke-line" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {points.length > 1 && (
            <>
              <path d={g.area} className="fill-gold/15" />
              <path d={g.line} className="fill-none stroke-gold" strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
            </>
          )}
        </svg>
        <span
          aria-hidden
          className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-ink bg-gold"
          style={{ left: `${g.last.left}%`, top: `${g.last.top}%` }}
        />
      </div>
      <p className="mt-2 font-mono text-xs text-muted">
        High {formatPrice(g.high)} · Low {formatPrice(g.low)}
      </p>
    </div>
  );
}
