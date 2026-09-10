/**
 * Route transition.
 *
 * This used to mount a framer-motion element on every navigation, which meant
 * the new page waited on React and the animation runtime before it could fade
 * in. The same effect as one CSS keyframe costs nothing at runtime, runs on the
 * compositor, and starts on the very first painted frame — so a page change
 * feels immediate. `prefers-reduced-motion` is honoured in globals.css.
 */
import { RevealObserver } from "@/components/reveal-observer";

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="page-enter">
      {/* Remounts per navigation, so the new page's reveals get picked up. */}
      <RevealObserver />
      {children}
    </div>
  );
}
