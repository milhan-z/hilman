"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "../use-reduced-motion";

type AnimationItem = import("lottie-web/build/player/lottie_light").AnimationItem;
type MomentSource = `/lottie/${"sent-note" | "page-not-filed" | "filed-idea" | "play-design" | "play-motion" | "play-code"}.json`;

/** Where a moment rests: its last frame, or the frame of a named marker. */
export type StillFrame = "last" | { marker: string };

/**
 * A transparent notebook illustration, played once when seen, then still.
 * The matching SVG is visible in the server HTML, on loading failure and
 * with reduced motion. Below-fold moments defer both JSON and the light
 * player until visible. Offscreen/background playback pauses; a new source
 * cancels the previous load. Remount only for an explicit replay action.
 */
export function NotebookMoment({ src, stillFrame, size, playOn, className }: {
  src: MomentSource;
  stillFrame: StillFrame;
  /** Width and height of the square, in CSS pixels. */
  size: number;
  /** "mount": once loaded. "view": load and play only when on screen. */
  playOn: "mount" | "view";
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const moment = useRef<{ rest: () => void } | null>(null);
  const marker = typeof stillFrame === "string" ? null : stillFrame.marker;

  useEffect(() => {
    if (reduced) moment.current?.rest();
  }, [reduced]);

  useEffect(() => {
    const node = box.current;
    const canvas = stage.current;
    if (!node || !canvas) return;
    const controller = new AbortController();
    let gone = false, loading = false, ready = false, done = false;
    let visible = playOn === "mount";
    let animation: AnimationItem | undefined;
    let observer: IntersectionObserver | undefined;
    const prefersStill = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rest = () => {
      done = true;
      animation?.pause();
      node.dataset.bitsMoment = "still";
    };
    const owner = { rest };
    moment.current = owner;

    const syncPlayback = () => {
      if (gone || done) return;
      if (prefersStill()) { rest(); return; }
      if (!ready || !animation) return;
      if (visible && !document.hidden) {
        node.dataset.bitsMoment = "playing";
        animation.play();
      } else {
        animation.pause();
        node.dataset.bitsMoment = "paused";
      }
    };
    const load = () => {
      if (gone || loading || done) return;
      if (prefersStill()) { rest(); return; }
      loading = true;
      Promise.all([
        import("lottie-web/build/player/lottie_light"),
        fetch(src, { signal: controller.signal }).then((response) => {
          if (!response.ok) throw new Error(`${src}: ${response.status}`);
          return response.json();
        }),
      ]).then(([{ default: lottie }, animationData]) => {
        if (gone || done) return;
        animation = lottie.loadAnimation({
          container: canvas, renderer: "svg", loop: false, autoplay: false,
          animationData,
          rendererSettings: { preserveAspectRatio: "xMidYMid meet", progressiveLoad: true },
        });
        const named = marker === null ? undefined : animationData.markers?.find((m: { cm?: string }) => m.cm === marker);
        const still = named ? named.tm : Math.max(0, Math.round(animation.totalFrames) - 1);
        const onReady = () => { ready = true; syncPlayback(); };
        animation.addEventListener("DOMLoaded", onReady);
        if (animation.isLoaded) onReady();
        animation.addEventListener("complete", () => {
          if (gone || done) return;
          done = true;
          animation?.goToAndStop(still, true);
          node.dataset.bitsMoment = "settled";
          observer?.disconnect();
        });
        animation.addEventListener("data_failed", rest);
      }).catch(() => {
        // The effect owns its player: a late failed old load cannot destroy
        // the next mode's drawing. Keep the static illustration on failure.
        if (gone) return;
        animation?.destroy();
        rest();
      });
    };
    const onVisibility = () => {
      if (visible && !document.hidden) load();
      syncPlayback();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (typeof IntersectionObserver === "undefined") {
      visible = true;
      onVisibility();
    } else {
      observer = new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        onVisibility();
      }, { threshold: 0.15 });
      observer.observe(node);
      if (playOn === "mount") onVisibility();
    }

    return () => {
      gone = true;
      controller.abort();
      observer?.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      animation?.destroy();
      if (moment.current === owner) moment.current = null;
      delete node.dataset.bitsMoment;
    };
  }, [src, marker, playOn]);

  return <div ref={box} aria-hidden="true" role="presentation"
    className={className ? `bits-moment ${className}` : "bits-moment"} style={{ width: size }}>
    {/* A local vector asset: no image optimization or runtime required. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img className="bits-moment-still" src={src.replace(/\.json$/, ".svg")} alt="" width={320} height={320} loading="lazy" decoding="async" />
    <div ref={stage} className="bits-moment-stage" />
  </div>;
}
