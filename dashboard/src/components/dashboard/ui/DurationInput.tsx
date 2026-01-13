"use client";

import { useState, useEffect } from "react";

interface DurationInputProps {
    value: number; // Total seconds
    onChange: (seconds: number) => void;
    label?: string;
}

export function DurationInput({ value, onChange, label = "Cooldown" }: DurationInputProps) {
    // Initialize state from value
    const [hours, setHours] = useState(Math.floor(value / 3600));
    const [minutes, setMinutes] = useState(Math.floor((value % 3600) / 60));
    const [seconds, setSeconds] = useState(value % 60);

    // Sync only when value prop changes externally (optional, but good practice if value can be updated from outside essentially)
    // However, to avoid fighting with local edits, we usually only sync on mount or if external ID changes. 
    // For this simple case, useEffect to sync when prop changes is safe if we don't cause loops.
    useEffect(() => {
        setHours(Math.floor(value / 3600));
        setMinutes(Math.floor((value % 3600) / 60));
        setSeconds(value % 60);
    }, [value]);

    const updateDuration = (h: number, m: number, s: number) => {
        const total = (h * 3600) + (m * 60) + s;
        onChange(total);
        // We let the parent update the value prop, which circles back to useEffect
    };

    const handleH = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        // setHours(val); // Optimistic update
        updateDuration(val, minutes, seconds);
    };

    const handleM = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        // setMinutes(val);
        updateDuration(hours, val, seconds);
    };

    const handleS = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        // setSeconds(val);
        updateDuration(hours, minutes, val);
    };

    return (
        <div className="space-y-1">
            <label className="text-xs text-zinc-500">{label}</label>
            <div className="flex flex-wrap gap-1">
                <div className="flex flex-col gap-0.5 flex-1 min-w-[60px]">
                    <input
                        type="number"
                        min={0}
                        value={hours}
                        onChange={handleH}
                        placeholder="Hr"
                        className="bg-black/40 border border-white/10 rounded px-1 py-1.5 text-white text-center text-sm w-full"
                    />
                    <span className="text-[10px] text-zinc-600 text-center">Hrs</span>
                </div>
                <span className="py-1.5 text-zinc-600 font-bold">:</span>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[60px]">
                    <input
                        type="number"
                        min={0}
                        max={59}
                        value={minutes}
                        onChange={handleM}
                        placeholder="Min"
                        className="bg-black/40 border border-white/10 rounded px-1 py-1.5 text-white text-center text-sm w-full"
                    />
                    <span className="text-[10px] text-zinc-600 text-center">Mins</span>
                </div>
                <span className="py-1.5 text-zinc-600 font-bold">:</span>
                <div className="flex flex-col gap-0.5 flex-1 min-w-[60px]">
                    <input
                        type="number"
                        min={0}
                        max={59}
                        value={seconds}
                        onChange={handleS}
                        placeholder="Sec"
                        className="bg-black/40 border border-white/10 rounded px-1 py-1.5 text-white text-center text-sm w-full"
                    />
                    <span className="text-[10px] text-zinc-600 text-center">Secs</span>
                </div>
            </div>
        </div>
    );
}
