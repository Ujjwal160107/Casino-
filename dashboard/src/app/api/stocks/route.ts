import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Read at request time only: the market ticks every 30 minutes, so a
// one-minute shared cache keeps the database out of every page view.
export const dynamic = "force-dynamic";

const POINTS = 48; // 24 hours at one point per 30-minute tick
const READ_TIMEOUT_MS = 8000; // fail fast instead of hanging on server selection

function withTimeout<T>(p: Promise<T>): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("market read timed out")), READ_TIMEOUT_MS))]);
}

export type StockSeries = {
  symbol: string;
  name: string;
  price: number;
  previous: number;
  status: string;
  updatedAt: string;
  points: { at: string; price: number }[];
};

export async function GET() {
  try {
    const stocks = await withTimeout(prisma.stock.findMany({
      where: { status: { not: "DELISTED" } },
      select: { symbol: true, name: true, currentPrice: true, previousPrice: true, status: true, lastUpdate: true },
      orderBy: { symbol: "asc" },
    }));
    const series: StockSeries[] = await withTimeout(Promise.all(
      stocks.map(async (s) => {
        const pts = await prisma.stockPricePoint.findMany({
          where: { symbol: s.symbol },
          orderBy: { at: "desc" },
          take: POINTS,
          select: { at: true, price: true },
        });
        return {
          symbol: s.symbol,
          name: s.name,
          price: s.currentPrice,
          previous: s.previousPrice,
          status: s.status,
          updatedAt: s.lastUpdate.toISOString(),
          points: pts.reverse().map((p) => ({ at: p.at.toISOString(), price: p.price })),
        };
      }),
    ));
    return NextResponse.json({ stocks: series }, { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch (err) {
    console.error("[api/stocks] market read failed:", err);
    return NextResponse.json({ error: "The market is unavailable right now." }, { status: 503 });
  }
}
