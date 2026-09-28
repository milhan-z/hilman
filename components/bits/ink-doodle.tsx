"use client";

import { useEffect, useRef, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

/**
 * The ink doodles in public/lottie — Lottie drawings made for this notebook.
 * Their canvases, in Lottie's own units: the box keeps the drawing's shape
 * before anything has loaded.
 */
export const DOODLES = {
  "notebook-doodle": [240, 200],
  "paper-plane": [320, 200],
  "notebook-flip": [240, 200],
  "pencil-scribble": [200, 160],
} as const;

export type DoodleName = keyof typeof DOODLES;

/**
 * A small ink drawing that draws itself once, when it comes into view.
 *
 * The server sends the finished drawing — the animation's last frame, as a
 * plain SVG image (public/lottie/<name>.svg) — so a browser without
 * JavaScript, a reader who asked for less motion, and print all get the
 * drawing and never download a player. Only where motion is welcome and
 * scripts run is that image held back (bits.css) for the Lottie player to
 * draw it instead, and the player itself — lottie-web's light SVG build,
 * ~46 KB — is fetched only when a doodle nears the screen, on the pages that
 * have one. If it cannot load, the image comes back.
 *
 * It plays once and stays on its last frame, which is the image it replaced.
 * Decoration only: aria-hidden, with whatever it illustrates said in text
 * beside it.
 */
export function InkDoodle({ name, className, style }: { name: DoodleName; className?: string; style?: CSSProperties }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [width, height] = DOODLES[name];

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const still = () => {
      node.dataset.bitsDoodle = "still";
    };
    if (typeof IntersectionObserver === "undefined" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      still();
      return;
    }
    let stop: (() => void) | undefined;
    let gone = false;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        import("./ink-doodle-player")
          .then(({ drawDoodle }) => drawDoodle(node.querySelector<HTMLElement>(".bits-doodle-stage")!, `/lottie/${name}.json`))
          .then((stopDrawing) => {
            if (gone) stopDrawing();
            else {
              stop = stopDrawing;
              node.dataset.bitsDoodle = "drawn";
            }
          })
          .catch(still);
      },
      // A little inside the screen, where the reader is looking — as InView.
      { rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(node);
    return () => {
      gone = true;
      observer.disconnect();
      stop?.();
    };
  }, [name]);

  return (
    <span ref={ref} aria-hidden className={cn("bits-doodle", className)} style={{ aspectRatio: `${width} / ${height}`, ...style }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- a static SVG, not a photograph for the image optimiser */}
      {/* lazy: decoration, never worth a preload ahead of the page's own images */}
      <img className="bits-doodle-poster" src={`/lottie/${name}.svg`} alt="" width={width} height={height} loading="lazy" decoding="async" />
      <span className="bits-doodle-stage" />
    </span>
  );
}
