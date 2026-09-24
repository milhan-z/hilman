"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * Whether the visitor has asked for less motion, following the setting live.
 *
 * The carousel and the accordion only need this one answer, and taking it
 * from Framer Motion meant downloading the animation library to read a media
 * query. The server — and so the first, hydrating render — says `false`,
 * which is what the markup was sent with; the real value lands straight after
 * without a hydration mismatch.
 */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false
  );
}
