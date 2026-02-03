"use client";

import { useState, useEffect } from "react";

interface DurationInputProps {
    value: number; // Total seconds
    onChange: (seconds: number) => void;
    label?: string;
    disabled?: boolean;
}

export function DurationInput({ value, onChange, label = "Duration", disabled = false }: DurationInputProps) {
    // Initialize state from value
    const [days, setDays] = useState(Math.floor(value / 86400));
    const [hours, setHours] = useState(Math.floor((value % 86400) / 3600));
    const [minutes, setMinutes] = useState(Math.floor((value % 3600) / 60));
    const [seconds, setSeconds] = useState(value % 60);

    useEffect(() => {
        setDays(Math.floor(value / 86400));
        setHours(Math.floor((value % 86400) / 3600));
        setMinutes(Math.floor((value % 3600) / 60));
        setSeconds(value % 60);
    }, [value]);

    const updateDuration = (d: number, h: number, m: number, s: number) => {
        const total = (d * 86400) + (h * 3600) + (m * 60) + s;
        onChange(total);
    };

    const handleD = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        updateDuration(val, hours, minutes, seconds);
    };

    const handleH = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        updateDuration(days, val, minutes, seconds);
    };

    const handleM = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        updateDuration(days, hours, val, seconds);
    };

    const handleS = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = Math.max(0, parseInt(e.target.value) || 0);
        updateDuration(days, hours, minutes, val);
    };

    return (
        <div className={`space-y-1 ${disabled ? 'opacity-60' : ''} w-full`}>
            {label && <label className="text-xs text-white uppercase font-bold tracking-wider">{label}</label>}
            <div className="grid grid-cols-4 gap-2">
                <div className="flex flex-col gap-0.5">
                    <input
                        type="number"
                        min={0}
                        value={days}
                        onChange={handleD}
                        placeholder="Days"
                        className="bg-white/5 border border-white/10 rounded px-1 py-1.5 text-white text-center text-sm w-full transition-colors focus:bg-white/10 outline-none focus:border-white/20"
                        disabled={disabled}
                    />
                    <span className="text-[10px] text-zinc-400 text-center">Days</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <input
                        type="number"
                        min={0}
                        value={hours}
                        onChange={handleH}
                        placeholder="Hr"
                        className="bg-white/5 border border-white/10 rounded px-1 py-1.5 text-white text-center text-sm w-full transition-colors focus:bg-white/10 outline-none focus:border-white/20"
                        disabled={disabled}
                    />
                    <span className="text-[10px] text-zinc-400 text-center">Hrs</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <input
                        type="number"
                        min={0}
                        max={59}
                        value={minutes}
                        onChange={handleM}
                        placeholder="Min"
                        className="bg-white/5 border border-white/10 rounded px-1 py-1.5 text-white text-center text-sm w-full transition-colors focus:bg-white/10 outline-none focus:border-white/20"
                        disabled={disabled}
                    />
                    <span className="text-[10px] text-zinc-400 text-center">Mins</span>
                </div>
                <div className="flex flex-col gap-0.5">
                    <input
                        type="number"
                        min={0}
                        max={59}
                        value={seconds}
                        onChange={handleS}
                        placeholder="Sec"
                        className="bg-white/5 border border-white/10 rounded px-1 py-1.5 text-white text-center text-sm w-full transition-colors focus:bg-white/10 outline-none focus:border-white/20"
                        disabled={disabled}
                    />
                    <span className="text-[10px] text-zinc-400 text-center">Secs</span>
                </div>
            </div>
        </div>
    );
}
