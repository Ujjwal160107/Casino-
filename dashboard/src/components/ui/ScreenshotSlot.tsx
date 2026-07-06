import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function ScreenshotSlot({
  src,
  alt,
  caption,
  className,
}: {
  /** public path, e.g. "/screenshots/bank.png" */
  src: string;
  alt: string;
  caption?: string;
  className?: string;
}) {
  const exists = fs.existsSync(path.join(process.cwd(), "public", src));

  if (!exists) {
    return (
      <figure className={className}>
        <div className="flex aspect-video items-center justify-center rounded-2xl border border-dashed border-line bg-panel px-6 text-center">
          <div>
            <p className="font-mono text-sm text-muted">bot screenshot slot</p>
            <p className="mt-1 text-xs text-muted">
              drop <span className="font-mono text-ink">{src}</span> into
              public/ and it appears here
            </p>
          </div>
        </div>
        {caption && (
          <figcaption className="mt-2 text-center text-sm text-muted">
            {caption}
          </figcaption>
        )}
      </figure>
    );
  }

  return (
    <figure className={className}>
      <div className={cn("relative aspect-video overflow-hidden rounded-2xl border border-line bg-panel")}>
        <Image src={src} alt={alt} fill className="object-cover" />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
