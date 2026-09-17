"use client";

import { useEffect, useRef, useState } from "react";
import { BrowserFrame, PhoneFrame } from "./blocks/media-frames";
import { cn } from "@/lib/utils";
import type { LoopClipLayout } from "@/lib/media-layouts";

/**
 * A Loop Clip, mounted only once it is close to being seen.
 *
 * There is no `loading="lazy"` for `<video>` the way there is for `<img>`. An
 * autoplaying, muted, looping clip in the DOM starts asking for bytes the
 * moment the browser parses the tag — so a case study with six of them would
 * otherwise open six video connections before a visitor has scrolled past the
 * first one, which is exactly the bandwidth problem this block exists to
 * avoid (see the file comment in lib/studio-local/clip-check.ts: the whole
 * point of a muted, looping MP4 over a GIF is that it is *lighter*, and
 * loading eight of them at once throws that away).
 *
 * So the `<video>` element itself does not exist until an IntersectionObserver
 * says the clip is within about one screen height of the viewport, mirroring
 * `<YouTubeFacade />`'s click-to-mount for the same reason: keep the heavy
 * element off the critical path until there is a real chance it gets watched.
 * `aspect-video` on both the placeholder and the mounted clip is the same
 * simplification `<YouTubeFacade />` already makes — most clips captured for
 * a case study are landscape UI recordings, and a fixed box means nothing
 * jumps when the real element mounts.
 */
export function LoopClipFacade({
  src,
  caption,
  fit = "cover",
  layout = "default",
}: {
  src: string;
  caption?: string;
  fit?: "cover" | "contain";
  /** Presentation only. It never changes how the clip plays or when it mounts. */
  layout?: LoopClipLayout;
}) {
  const [visible, setVisible] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (visible) return;
    const node = boxRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === "undefined") {
      // No observer support: show it rather than never show it.
      setVisible(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "600px 0px" }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [visible]);

  /**
   * The clip itself, identical in every presentation.
   *
   * The observer ref, the mount gate and every video attribute live here and
   * not in the branches below, so a presentation can change what is drawn
   * around a clip and cannot change how it plays or when it loads.
   */
  const screen = (aspect: string) => (
    <div ref={boxRef} className={cn("relative overflow-hidden bg-n-900", aspect)}>
      {visible && (
        <video
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          className={cn(
            "absolute inset-0 h-full w-full",
            fit === "contain" ? "object-contain" : "object-cover"
          )}
        />
      )}
    </div>
  );

  if (layout === "browser") {
    return (
      <figure className="!max-w-none">
        <BrowserFrame>{screen("aspect-video")}</BrowserFrame>
        {caption && <figcaption className="mt-2 font-hand text-lg text-faint">{caption}</figcaption>}
      </figure>
    );
  }

  if (layout === "phone") {
    return (
      <figure className="!max-w-none">
        {/* Portrait, because a screen recording from a phone is portrait. */}
        <PhoneFrame>{screen("aspect-[9/16]")}</PhoneFrame>
        {caption && (
          <figcaption className="mt-2 text-center font-hand text-lg text-faint">{caption}</figcaption>
        )}
      </figure>
    );
  }

  if (layout === "floating") {
    return (
      <figure className="!max-w-none">
        <div
          className={cn(
            "overflow-hidden rounded-lg border border-line shadow-lift",
            // One settle as it comes into view, driven by the same flag that
            // mounts the video — no library, and nothing that keeps moving
            // afterwards. Reduced motion gets the final state immediately.
            "transition-[transform,opacity] duration-500 ease-out motion-reduce:transition-none",
            visible ? "translate-y-0 scale-100 opacity-100" : "translate-y-2 scale-[0.98] opacity-0",
            "motion-reduce:translate-y-0 motion-reduce:scale-100 motion-reduce:opacity-100"
          )}
        >
          {screen("aspect-video")}
        </div>
        {caption && <figcaption className="mt-2 font-hand text-lg text-faint">{caption}</figcaption>}
      </figure>
    );
  }

  return (
    <figure className="!max-w-none">
      <div className="overflow-hidden rounded-md border border-line">
        {screen("aspect-video")}
      </div>
      {caption && <figcaption className="mt-2 font-hand text-lg text-faint">{caption}</figcaption>}
    </figure>
  );
}
