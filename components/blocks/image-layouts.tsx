import { Pic } from "../cld-image";
import { BrowserFrame, PhoneFrame } from "./media-frames";
import { pixelDimension } from "@/lib/block-layout";
import { cn } from "@/lib/utils";
import type { ImageLayout } from "@/lib/media-layouts";

/**
 * One image, presented five ways.
 *
 * None of these change what the block holds — the same `public_id`, the same
 * alt text, the same caption. They change what it is framed as, because a
 * screenshot of a website and a photograph from an evening are not the same
 * kind of object and a portfolio that draws them identically is flattening
 * something true about them.
 *
 * All five stay server components. There is no entrance animation on an image:
 * the framing is the idea, and a photograph that fades in is a photograph you
 * waited for. Motion in this system is spent where it explains an interaction
 * — the carousel's position, the accordion's panel, the stack settling — and
 * not on decorating things that are already still.
 */

export function ImagePresentation({
  layout,
  data,
}: {
  layout: ImageLayout;
  data: Record<string, any>;
}) {
  const src = data.public_id ?? data.src;
  const alt = data.alt ?? "";
  const caption = data.caption as string | undefined;
  const width = pixelDimension(data.width, 1600);
  const height = pixelDimension(data.height, 1000);

  switch (layout) {
    case "full":
      return (
        <figure className="!max-w-none">
          <Pic
            src={src}
            alt={alt}
            width={width}
            height={height}
            sizes="(max-width: 900px) 100vw, 1200px"
            className="w-full rounded-sm"
          />
          {caption && <Caption>{caption}</Caption>}
        </figure>
      );

    case "browser":
      return (
        <figure className="!max-w-none">
          <BrowserFrame label={typeof data.alt === "string" ? data.alt : undefined}>
            <Pic
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes="(max-width: 900px) 100vw, 860px"
              className="block w-full"
            />
          </BrowserFrame>
          {caption && <Caption>{caption}</Caption>}
        </figure>
      );

    case "phone":
      return (
        <figure className="!max-w-none">
          <PhoneFrame>
            <Pic
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes="280px"
              className="block w-full"
            />
          </PhoneFrame>
          {caption && <Caption className="text-center">{caption}</Caption>}
        </figure>
      );

    case "polaroid":
      return (
        <figure className="!max-w-none flex justify-center">
          <div
            className="max-w-[26rem] rounded-sm border border-line bg-paper p-2.5 pb-10 shadow-lift sm:p-3 sm:pb-12"
            // Deterministic from the image itself: the same photograph always
            // lies at the same angle, on the server and in the browser, on
            // every render. See tiltFor().
            style={{ transform: `rotate(${tiltFor(String(src ?? ""))}deg)` }}
          >
            <Pic
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes="(max-width: 640px) 88vw, 26rem"
              className="block w-full"
            />
            {caption && (
              <figcaption className="px-1 pt-3 text-center font-hand text-lg text-faint">
                {caption}
              </figcaption>
            )}
          </div>
        </figure>
      );

    case "default":
    default:
      // Byte for byte what every published image already renders as.
      return (
        <figure className="!max-w-none">
          <div className="overflow-hidden rounded-md border border-line shadow-card">
            <Pic
              src={src}
              alt={alt}
              width={width}
              height={height}
              sizes="(max-width: 900px) 100vw, 860px"
              className="w-full"
            />
          </div>
          {caption && <Caption>{caption}</Caption>}
        </figure>
      );
  }
}

function Caption({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <figcaption className={cn("mt-2 font-hand text-lg text-faint", className)}>
      {children}
    </figcaption>
  );
}

/** Angles a print might land at. Small enough to read as a tilt, not a mistake. */
const TILTS = [-1.8, 1.4, -1.1, 2.0, -2.2, 0.9];

/**
 * A stable angle for a given image.
 *
 * Hashing the source rather than calling Math.random() is what makes this
 * safe in a server-rendered page: a random angle would differ between the HTML
 * and the hydrated client — a mismatch React would warn about and then
 * correct by visibly moving the photograph — and would differ again on every
 * later render.
 */
function tiltFor(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  }
  return TILTS[Math.abs(hash) % TILTS.length];
}
