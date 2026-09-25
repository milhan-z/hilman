import { ViewTransition, type CSSProperties, type ReactNode } from "react";

/**
 * The name a work's photograph goes by on every page it appears on — the
 * card in a list, the cover on its own page. The same name on both sides is
 * what pairs them.
 */
export const workPhotoName = (id: string) => `work-${id}`;

/**
 * For the card laid over a work's cover (its entry header). The photograph
 * lands under that card, not on top of it, and the card itself does not
 * move: it is simply there when the page is. Without this the photograph
 * would fly in over the header, which would then jump back on top of it as
 * the transition ended.
 */
export const workHeaderStyle = { viewTransitionName: "bits-work-header" } satisfies CSSProperties;

/**
 * A work's photograph carried from the card you tapped into the cover of the
 * page it opens — the print picked up off the desk and laid out full size —
 * and back again when you return.
 *
 * It is React's `<ViewTransition>` with the house defaults, over the
 * browser's View Transitions: the browser takes a picture of the photograph
 * before the navigation and one after, and moves one into the other on the
 * compositor. Nothing about either page changes; the pages are what they
 * were, and swap at once as on any other navigation (bits.css keeps the
 * browser from cross-fading them). The movement exists only between them.
 *
 * - `share="bits-morph"`: the pair morphs (components/bits/bits.css sets the
 *   timing and keeps a 4:3 card and a wide cover from stretching into each
 *   other).
 * - `default="none"`: nothing else — no other navigation, no filter on the
 *   list — ever sets this photograph moving.
 *
 * When there is no pair there is no movement: a work without a cover, a page
 * not yet prefetched, a browser without View Transitions. The navigation is
 * then the ordinary one. Reduced motion swaps the pages at once.
 *
 * The way back is the site's own link ("Back to the archive", the nav). The
 * browser's back button and a swipe back are ordinary navigations: React
 * does not start a transition for them (measured, React 19.3 / Next 16.3),
 * and a phone's own swipe animation is better left without a second one on
 * top.
 *
 * Wrap the image itself (the `<Pic>`), not its frame: a "pinned" stamp or a
 * border belongs to the card, not to the photograph that travels.
 */
export function WorkTransition({ name, children }: { name: string; children: ReactNode }) {
  return (
    <ViewTransition name={name} share="bits-morph" default="none">
      {children}
    </ViewTransition>
  );
}
