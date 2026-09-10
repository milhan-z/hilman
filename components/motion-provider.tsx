"use client";

import { LazyMotion } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Loads framer-motion's animation features *after* the page is interactive.
 *
 * Every `motion.div` used to drag the full animation runtime into the bundle
 * that blocks first paint. With `LazyMotion` the components on the page are the
 * feather-weight `m.*` ones, and the ~30kb of DOM animation + layout projection
 * arrives in its own chunk once the browser is free. Elements render in their
 * final state meanwhile, so nothing is missing while it loads.
 *
 * `domMax` (not `domAnimation`) because the site's explorers use shared-layout
 * transitions, which live in the projection half of the library.
 */
const loadFeatures = () => import("framer-motion").then((mod) => mod.domMax);

export function MotionProvider({ children }: { children: ReactNode }) {
  return <LazyMotion features={loadFeatures}>{children}</LazyMotion>;
}
