"use client";

import { useMotionTemplate, useMotionValue, motion } from "framer-motion";
import { useEffect } from "react";

export function CursorSpotlight() {
    const mouseX = useMotionValue(0);
    const mouseY = useMotionValue(0);

    useEffect(() => {
        const handleMouseMove = ({ clientX, clientY }: MouseEvent) => {
            mouseX.set(clientX);
            mouseY.set(clientY);
        };

        window.addEventListener("mousemove", handleMouseMove);
        return () => window.removeEventListener("mousemove", handleMouseMove);
    }, [mouseX, mouseY]);

    return (
        <motion.div
            className="fixed inset-0 z-0 pointer-events-none transition-opacity duration-300"
            style={{
                background: useMotionTemplate`
                    radial-gradient(
                        600px circle at ${mouseX}px ${mouseY}px,
                        rgba(255, 215, 0, 0.03),
                        transparent 40%
                    ),
                    radial-gradient(
                        400px circle at ${mouseX}px ${mouseY}px,
                        rgba(0, 229, 255, 0.02),
                        transparent 40%
                    )
                `,
            }}
        />
    );
}
