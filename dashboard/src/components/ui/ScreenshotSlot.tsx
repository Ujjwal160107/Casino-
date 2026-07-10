import fs from "node:fs";
import path from "node:path";
import Image from "next/image";
import { cn } from "@/lib/utils";

export function ScreenshotSlot({
  src,
  alt,
  caption,
  className,
  aspect = "aspect-video",
  maxWidth,
}: {
  /** public path, e.g. "/art/stock-market.jpg" */
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  /** tailwind aspect class matching the image's native ratio so nothing is cropped */
  aspect?: string;
  /** tailwind max-width class for tall/portrait art, e.g. "max-w-xs" (centered) */
  maxWidth?: string;
}) {
  // Render nothing when the file isn't there — no placeholder boxes.
  const exists = fs.existsSync(path.join(process.cwd(), "public", src));
  if (!exists) return null;

  return (
    <figure className={className}>
      <div
        className={cn(
          "relative mx-auto overflow-hidden rounded-2xl border border-line bg-panel",
          aspect,
          maxWidth
        )}
      >
        {/* object-contain guarantees the whole image is visible — never cropped */}
        <Image src={src} alt={alt} fill sizes="768px" className="object-contain" />
      </div>
      {caption && (
        <figcaption className="mt-2 text-center text-sm text-muted">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}
