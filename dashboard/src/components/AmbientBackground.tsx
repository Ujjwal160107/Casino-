"use client";

import { motion } from "framer-motion";

export function AmbientBackground() {
    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
            {/* Top Right - Blue/Cyan Glow - INTENSIFIED */}
            <motion.div
                animate={{
                    opacity: [0.5, 0.8, 0.5],
                    scale: [1, 1.2, 1],
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute -top-[10%] -right-[10%] w-[900px] h-[900px] rounded-full bg-gradient-to-br from-cyan-400/30 to-blue-500/30 blur-[100px]"
            />

            {/* Bottom Left - Yellow/Gold Glow - INTENSIFIED */}
            <motion.div
                animate={{
                    opacity: [0.4, 0.7, 0.4],
                    scale: [1, 1.3, 1],
                }}
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1,
                }}
                className="absolute -bottom-[10%] -left-[10%] w-[1000px] h-[1000px] rounded-full bg-gradient-to-tr from-yellow-400/25 to-amber-400/25 blur-[100px]"
            />
        </div>
    );
}
