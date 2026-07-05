import { cn } from "@/lib/utils";

const BTN_STYLES = {
  primary: "bg-[#5865f2] text-white",
  secondary: "bg-[#4e5058] text-white",
  success: "bg-[#248046] text-white",
  danger: "bg-[#da373c] text-white",
} as const;

export function DiscordMockup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-line bg-[#313338] p-4 text-left text-[15px] leading-relaxed",
        className
      )}
      aria-label="Preview of Fortuna running in Discord"
    >
      <div className="space-y-4">{children}</div>
    </div>
  );
}

export function MockMessage({
  author,
  isBot = false,
  children,
}: {
  author: string;
  isBot?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-3">
      <div
        className={cn(
          "mt-0.5 h-9 w-9 shrink-0 rounded-full",
          isBot ? "bg-gold" : "bg-[#5865f2]"
        )}
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-white">
          {author}
          {isBot && (
            <span className="ml-1.5 rounded bg-[#5865f2] px-1 py-px align-middle text-[10px] font-bold uppercase text-white">
              App
            </span>
          )}
          <span className="ml-1.5 text-xs font-normal text-[#949ba4]">
            Today
          </span>
        </p>
        <div className="text-[#dbdee1]">{children}</div>
      </div>
    </div>
  );
}

export function MockEmbed({
  title,
  accent = "#ffb627",
  children,
}: {
  title?: string;
  accent?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="mt-1 max-w-md rounded border-l-4 bg-[#2b2d31] p-3"
      style={{ borderLeftColor: accent }}
    >
      {title && <p className="mb-1 font-semibold text-white">{title}</p>}
      <div className="text-sm text-[#dbdee1]">{children}</div>
    </div>
  );
}

export function MockButtons({
  buttons,
}: {
  buttons: { label: string; style?: keyof typeof BTN_STYLES }[];
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {buttons.map((b) => (
        <span
          key={b.label}
          className={cn(
            "rounded px-3.5 py-1.5 text-sm font-medium",
            BTN_STYLES[b.style ?? "secondary"]
          )}
        >
          {b.label}
        </span>
      ))}
    </div>
  );
}
