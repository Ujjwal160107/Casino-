"use client";

import { motion } from "framer-motion";

export function AmbientBackground() {
    return (
        <div className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none">
            {/* Top Right - Blue/Cyan Glow */}
            <motion.div
                animate={{
                    opacity: [0.4, 0.7, 0.4],
                    scale: [1, 1.2, 1],
                }}
                transition={{
                    duration: 8,
                    repeat: Infinity,
                    ease: "easeInOut",
                }}
                className="absolute -top-[10%] -right-[10%] w-[800px] h-[800px] rounded-full bg-gradient-to-br from-cyan-500/20 to-blue-600/20 blur-[120px]"
            />

            {/* Bottom Left - Yellow/Gold Glow */}
            <motion.div
                animate={{
                    opacity: [0.3, 0.6, 0.3],
                    scale: [1, 1.3, 1],
                }}
                transition={{
                    duration: 10,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 1, // Offset slightly
                }}
                className="absolute -bottom-[10%] -left-[10%] w-[900px] h-[900px] rounded-full bg-gradient-to-tr from-yellow-500/15 to-amber-500/15 blur-[130px]"
            />
        </div>
    );
}
