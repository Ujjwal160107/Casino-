import { cn } from "@/lib/utils";
import { FadeUp } from "@/components/ui/FadeUp";

export function FeatureSplit({
  eyebrow,
  title,
  body,
  bullets,
  media,
  flip = false,
}: {
  eyebrow: string;
  title: string;
  body: string;
  bullets: string[];
  media: React.ReactNode;
  flip?: boolean;
}) {
  return (
    <div className="mx-auto grid max-w-7xl items-center gap-12 px-6 py-16 lg:grid-cols-2">
      <div className={cn(flip && "lg:order-2")}>
        <p className="mb-2 font-mono text-sm font-medium uppercase tracking-widest text-gold">
          {eyebrow}
        </p>
        <h2 className="font-display text-3xl font-bold tracking-tight text-ink md:text-4xl">
          {title}
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-muted">{body}</p>
        <ul className="mt-6 space-y-2.5">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2.5 text-ink">
              <span aria-hidden className="mt-0.5 select-none text-gold">
                ♦
              </span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>
      <FadeUp className={cn(flip && "lg:order-1")}>{media}</FadeUp>
    </div>
  );
}
