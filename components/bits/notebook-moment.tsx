"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "../use-reduced-motion";

type AnimationItem = import("lottie-web/build/player/lottie_light").AnimationItem;

/** Where a moment rests: its last frame, or the frame of a named marker. */
export type StillFrame = "last" | { marker: string };

/**
 * An illustrated moment — one of the Lottie drawings in public/lottie —
 * played once, then held on its still.
 *
 * Lottie is for illustrated moments; HILMAN BITS is for interface motion
 * (docs/HILMAN-BITS.md, "Lottie: illustrated moments"). There are two, each
 * on one route: the sent note after a message has really been sent
 * (/connect), and the card pulled from the drawer with a "?" on it (the 404
 * page).
 *
 * The markup is only the box: a fixed square that holds the drawing's place,
 * so nothing shifts when it arrives, and that reads as nothing to assistive
 * technology. Everything else happens here, in the browser:
 * lottie-web's light SVG build and the drawing's JSON are fetched with
 * `import()` and `fetch()` when a moment mounts — never before, and never on
 * any other page. With no script the box stays empty; if either fails to
 * load it stays empty too. It is decoration.
 *
 * It plays once — on mount, or the first time it comes into view (already
 * on screen: straight away) — and never replays or runs backwards. Then it
 * rests on its still. Where the last frame is not the finished drawing (the
 * sent note is on its way out of the frame), it goes back to the still and
 * fades in on it, a 200 ms fade that only exists with no motion preference.
 * Reduced motion never plays at all: it gets the still, even when the
 * preference changes halfway through.
 */
export function NotebookMoment({
  src,
  stillFrame,
  size,
  playOn,
  className,
}: {
  src: "/lottie/sent-note.json" | "/lottie/page-not-filed.json";
  stillFrame: StillFrame;
  /** Width and height of the square, in CSS pixels. */
  size: number;
  /** "mount": as soon as it has loaded. "view": the first time it is on screen. */
  playOn: "mount" | "view";
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const reducedNow = useRef(reduced);
  const moment = useRef<{ animation: AnimationItem; still: number; done: boolean } | null>(null);
  const marker = typeof stillFrame === "string" ? null : stillFrame.marker;

  // The preference, as it is now: read by the loader below, and acted on
  // at once if it turns on while the drawing plays.
  useEffect(() => {
    reducedNow.current = reduced;
    const current = moment.current;
    if (reduced && current && !current.done) {
      current.done = true;
      current.animation.goToAndStop(current.still, true);
    }
  }, [reduced]);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    let gone = false;
    let observer: IntersectionObserver | undefined;

    const rest = (current: { animation: AnimationItem; still: number; done: boolean }) => {
      current.done = true;
      current.animation.goToAndStop(current.still, true);
    };

    Promise.all([
      import("lottie-web/build/player/lottie_light"),
      fetch(src).then((response) => {
        if (!response.ok) throw new Error(`${src}: ${response.status}`);
        return response.json();
      }),
    ])
      .then(([{ default: lottie }, animationData]) => {
        if (gone) return;
        const animation = lottie.loadAnimation({
          container: node,
          renderer: "svg",
          loop: false,
          autoplay: false,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: true },
        });
        const named = marker === null ? undefined : animationData.markers?.find((m: { cm?: string }) => m.cm === marker);
        const last = Math.max(0, Math.round(animation.totalFrames) - 1);
        const current = { animation, still: named ? named.tm : last, done: false };
        moment.current = current;

        if (reducedNow.current) {
          rest(current);
          return;
        }
        animation.addEventListener("complete", () => {
          if (current.done) return;
          current.done = true;
          if (current.still === last) return; // already resting on it
          animation.goToAndStop(current.still, true);
          node.dataset.bitsMoment = "settled";
        });
        const play = () => {
          if (current.done) return;
          if (reducedNow.current) rest(current);
          else animation.play();
        };
        if (playOn === "mount" || typeof IntersectionObserver === "undefined") {
          play();
          return;
        }
        // "view" follows InView's measure of the screen, trigger margin and
        // all — except that a moment already on screen plays straight away.
        let first = true;
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              const rect = entry.boundingClientRect;
              const onScreen = rect.top < window.innerHeight && rect.bottom > 0;
              if (entry.isIntersecting || (first && onScreen)) {
                observer?.disconnect();
                play();
              }
              first = false;
            }
          },
          { rootMargin: "0px 0px -10% 0px" }
        );
        observer.observe(node);
      })
      .catch(() => {
        // Decoration: an empty box, no error of its own.
        moment.current?.animation.destroy();
        moment.current = null;
        if (!gone) node.replaceChildren();
      });

    return () => {
      gone = true;
      observer?.disconnect();
      moment.current?.animation.destroy();
      moment.current = null;
    };
  }, [src, marker, playOn]);

  return (
    <div
      ref={box}
      aria-hidden="true"
      role="presentation"
      // Not cn(): lib/utils brings the date helpers along with it.
      className={className ? `bits-moment ${className}` : "bits-moment"}
      style={{ width: size }}
    />
  );
}
