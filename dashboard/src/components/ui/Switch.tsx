"use client";

import { motion } from "framer-motion";

interface SwitchProps {
    checked: boolean;
    onCheckedChange: (checked: boolean) => void;
    disabled?: boolean;
}

export function Switch({ checked, onCheckedChange, disabled }: SwitchProps) {
    return (
        <button
            type="button"
            role="switch"
            aria-checked={checked}
            disabled={disabled}
            onClick={() => onCheckedChange(!checked)}
            className={`
                relative w-11 h-6 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-black focus:ring-blue-500
                ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}
                ${checked ? "bg-green-500" : "bg-zinc-700"}
            `}
        >
            <motion.span
                layout
                transition={{ type: "spring", stiffness: 700, damping: 30 }}
                className={`
                    block w-5 h-5 rounded-full bg-white shadow-lg pointer-events-none
                `}
                animate={{
                    x: checked ? 22 : 2
                }}
            />
        </button>
    );
}
