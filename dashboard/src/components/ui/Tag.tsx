import { cn } from "@/lib/utils";

const STYLES = {
  gold: "bg-gold/15 text-gold border-gold/30",
  felt: "bg-felt/15 text-felt border-felt/30",
  chip: "bg-chip/15 text-chip border-chip/30",
  blue: "bg-card-blue/15 text-card-blue border-card-blue/30",
  neutral: "bg-panel-2 text-muted border-line",
} as const;

export function Tag({
  color = "neutral",
  className,
  children,
}: {
  color?: keyof typeof STYLES;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium",
        STYLES[color],
        className
      )}
    >
      {children}
    </span>
  );
}
