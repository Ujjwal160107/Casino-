import { cn } from "@/lib/utils";

export function SectionHeader({
  eyebrow,
  title,
  sub,
  align = "left",
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("mb-10", align === "center" && "text-center")}>
      {eyebrow && (
        <p className="mb-2 font-mono text-sm font-medium uppercase tracking-widest text-gold">
          {eyebrow}
        </p>
      )}
      <h2 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
        {title}
      </h2>
      {sub && <p className="mt-3 max-w-2xl text-lg text-muted">{sub}</p>}
    </div>
  );
}
