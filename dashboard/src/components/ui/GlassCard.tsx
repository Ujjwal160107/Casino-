import { cn } from "@/lib/utils";

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
    children: React.ReactNode;
    className?: string;
    gradient?: boolean;
}

export function GlassCard({ children, className, gradient = false, ...props }: GlassCardProps) {
    return (
        <div
            className={cn(
                "relative overflow-hidden rounded-xl border border-white/10 bg-black/90 md:bg-black/20 backdrop-blur-none md:backdrop-blur-md shadow-xl transition-all duration-300",
                gradient && "bg-gradient-to-br from-white/5 to-white/0",
                className
            )}
            {...props}
        >
            {/* Optional Noise Texture or subtle sheen could go here */}
            <div className="absolute inset-0 z-0 bg-white/5 opacity-0 hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            <div className="relative z-10">
                {children}
            </div>
        </div>
    );
}
