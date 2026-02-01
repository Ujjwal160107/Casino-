import { cn } from "@/lib/utils";

interface TextGlowProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: "gold" | "cyan" | "white";
    children: React.ReactNode;
}

export function TextGlow({ variant = "gold", className, children, ...props }: TextGlowProps) {
    const glowColors = {
        gold: "drop-shadow-[0_0_15px_rgba(255,215,0,0.5)]",
        cyan: "drop-shadow-[0_0_15px_rgba(0,229,255,0.5)]",
        white: "drop-shadow-[0_0_15px_rgba(255,255,255,0.5)]",
    };

    return (
        <span
            className={cn(
                "transition-all duration-300",
                glowColors[variant],
                className
            )}
            {...props}
        >
            {children}
        </span>
    );
}
