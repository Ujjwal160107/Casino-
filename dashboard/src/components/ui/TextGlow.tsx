import { cn } from "@/lib/utils";

interface TextGlowProps extends React.HTMLAttributes<HTMLSpanElement> {
    variant?: "gold" | "cyan" | "white";
    children: React.ReactNode;
}

export function TextGlow({ variant = "gold", className, children, ...props }: TextGlowProps) {
    const glowColors = {
        gold: "drop-shadow-[0_0_10px_rgba(255,215,0,0.2)]",
        cyan: "drop-shadow-[0_0_10px_rgba(0,229,255,0.2)]",
        white: "drop-shadow-[0_0_10px_rgba(255,255,255,0.1)]",
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
