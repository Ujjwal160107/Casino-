"use client";

import { useEffect, useRef, useState } from "react";
import { btn, useReducedMotionPref } from "@/components/landing/kit";
import { cn } from "@/lib/utils";
import { formatInt } from "./format";
import { Tile } from "./Tile";

/** Work a shift: a meter fills, the wallet counts up by one Waiter's pay, and the log counts down to the first promotion. */
export function WorkShiftTile({ pay, nextJob, nextJobPay, shiftsForPromotion, startWallet }: {
  pay: number;
  nextJob: string;
  nextJobPay: number;
  shiftsForPromotion: number;
  startWallet: number;
}) {
  const reduced = useReducedMotionPref();
  const [wallet, setWallet] = useState(startWallet);
  const [shifts, setShifts] = useState(0);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState("");
  const barRef = useRef<HTMLElement>(null);
  const walletRef = useRef<HTMLElement>(null);
  const cashRef = useRef(startWallet);
  const meterAnim = useRef<Animation | null>(null);
  const frame = useRef(0);

  useEffect(() => () => {
    meterAnim.current?.cancel();
    cancelAnimationFrame(frame.current);
  }, []);

  function countUp(from: number, to: number) {
    if (reduced) return setWallet(to);
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / 600);
      setWallet(from + (to - from) * (1 - Math.pow(1 - k, 3)));
      if (k < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
  }

  async function work() {
    if (busy) return;
    setBusy(true);
    const anim = barRef.current?.animate([{ transform: "scaleX(0)" }, { transform: "scaleX(1)" }], {
      duration: reduced ? 0 : 1100,
      easing: "cubic-bezier(.65,0,.35,1)",
      fill: "forwards",
    });
    meterAnim.current = anim ?? null;
    try {
      await anim?.finished;
    } catch {
      return; // cancelled on unmount
    }
    const n = shifts + 1;
    const from = cashRef.current;
    cashRef.current = from + pay;
    countUp(from, cashRef.current);
    if (!reduced) walletRef.current?.animate([{ transform: "none" }, { transform: "scale(1.12) rotate(-2deg)", offset: 0.4 }, { transform: "none" }], { duration: 450, easing: "cubic-bezier(.16,1,.3,1)" });
    const left = shiftsForPromotion - n;
    setShifts(n);
    setLog(`Shift ${n} done · +${formatInt(pay)}${left > 0 ? ` · ${left} more for your first promotion` : left === 0 ? ` · ${nextJob} unlocked` : ""}`);
    setBusy(false);
  }

  return (
    <Tile
      tone="gold"
      kicker="Jobs · !work"
      title="Work a shift."
      copy={`Waiters earn ${formatInt(pay)} a shift, and you can work one every hour. After ${shiftsForPromotion} shifts you can move up to ${nextJob}, which pays ${formatInt(nextJobPay)}.`}
    >
      <div className="mt-4 h-3.5 overflow-hidden rounded-full bg-bg/20">
        <i ref={barRef} className="block h-full origin-left bg-bg" style={{ transform: "scaleX(0)" }} />
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-4 pt-4">
        <button
          type="button"
          onClick={work}
          disabled={busy}
          className={cn(btn.base, "border-bg bg-bg text-ink shadow-[4px_4px_0_rgba(12,12,12,.45)] hover:-translate-x-0.5 hover:-translate-y-0.5 disabled:opacity-70")}
        >
          {busy ? "Working…" : shifts ? "Work another" : "Work a shift"}
        </button>
        <div className="ml-auto grid text-right">
          <span className="font-mono text-xs font-bold uppercase tracking-[.12em] opacity-75">Wallet</span>
          <b ref={walletRef} className="inline-block font-display text-[clamp(40px,4vw,56px)] font-black leading-none tabular-nums">
            {formatInt(wallet)}
          </b>
        </div>
      </div>
      <p className="min-h-5 font-mono text-[13px] font-semibold" aria-live="polite">{log}</p>
    </Tile>
  );
}
