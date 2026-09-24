import { domMax } from "framer-motion";

/**
 * Framer Motion's animation engine, as a chunk of its own.
 *
 * The explorers render through <LazyMotion features={loadMotionFeatures}>,
 * which puts only the small `m` components in the page's first download and
 * fetches this — the layout and exit animations — straight after. Nothing
 * animates on first render anyway (the cards are already where they belong),
 * so the only thing that waits for this file is the first filter change.
 *
 * `domMax` rather than `domAnimation`, because the grid's `layout` reflow is
 * a layout animation, and that lives only in the larger set.
 */
export default domMax;
