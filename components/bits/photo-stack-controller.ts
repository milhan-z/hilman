import { cssDuration } from "./tokens";

/**
 * PhotoStack's hands, attached to a pile the server has drawn (see
 * photo-stack.tsx for the markup it reads): a tap on the pile or "Next" puts
 * the top print back underneath; "Look closer" asks for the lightbox.
 *
 * It works on the page as it is rather than through React state: the pile is
 * a server component, in the HTML from the first byte, and this only moves
 * what is already there — each print's place (a CSS variable and a z-index),
 * which words are showing, the count, the announcement. Loaded on its own,
 * after the page, by <PhotoStackHands>.
 *
 * Returns `show(index)`, which puts a given print on top without the lift
 * (the lightbox uses it), and `detach()`.
 */
export function attachPhotoStack(
  root: HTMLElement,
  hands: { reach: () => void; look: (index: number) => void }
): { show: (index: number) => void; detach: () => void } {
  const prints = [...root.querySelectorAll<HTMLElement>("[data-bits-print]")];
  const words = [...root.querySelectorAll<HTMLElement>("[data-bits-words]")];
  const counter = root.querySelector<HTMLElement>('[data-bits-pile="count"]');
  const look = root.querySelector<HTMLElement>('[data-bits-pile="look"]');
  const lookLabel = root.querySelector<HTMLElement>('[data-bits-pile="look-label"]');
  const announce = root.querySelector<HTMLElement>('[data-bits-pile="announce"]');
  const count = prints.length;
  let top = 0;

  const title = (index: number) => prints[index]?.dataset.bitsTitle ?? "";

  const show = (index: number, said = false) => {
    top = index;
    prints.forEach((print, i) => {
      const place = (i - top + count) % count;
      print.style.zIndex = String(count - place);
      print.style.setProperty("--bits-print-place", String(place));
    });
    words.forEach((element, i) => {
      element.hidden = i !== top;
    });
    if (counter) counter.textContent = String(top + 1);
    if (look) look.hidden = !prints[top]?.hasAttribute("data-bits-photo");
    if (lookLabel) lookLabel.textContent = title(top) ? `: ${title(top)}` : "";
    if (said && announce) announce.textContent = `${top + 1} of ${count} on top${title(top) ? `: ${title(top)}` : ""}`;
  };

  const next = () => {
    if (count < 2) return;
    const leaving = prints[top];
    if (leaving && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const tokens = getComputedStyle(document.documentElement);
      // Lifted off the top a touch, fading as it goes (easing in, as a hand
      // picks it up); then, already underneath the others, back into view as
      // the bottom print (easing out). Each half has its own easing: one
      // curve over the whole would spend the lift in the first few frames.
      leaving.animate(
        [
          { opacity: 1, scale: "1", zIndex: count + 1, easing: "cubic-bezier(0.4, 0, 1, 1)" },
          { opacity: 0, scale: "1.03", zIndex: count + 1, offset: 0.45 },
          { opacity: 0, scale: "1", zIndex: 1, offset: 0.45, easing: tokens.getPropertyValue("--motion-ease-out").trim() || "ease-out" },
          { opacity: 1, scale: "1", zIndex: 1 },
        ],
        { duration: cssDuration(tokens.getPropertyValue("--motion-reveal"), 520) }
      );
    }
    show((top + 1) % count, true);
  };

  const onClick = (event: MouseEvent) => {
    const target = event.target as Element | null;
    if (target?.closest('[data-bits-pile="look"]')) hands.look(top);
    else if (target?.closest('[data-bits-pile="next"], [data-bits-pile="pile"]')) next();
  };
  // Reaching for "Look closer" is when the lightbox starts to load.
  const onReach = (event: Event) => {
    if ((event.target as Element | null)?.closest?.('[data-bits-pile="look"]')) hands.reach();
  };

  root.addEventListener("click", onClick);
  root.addEventListener("pointerover", onReach);
  root.addEventListener("focusin", onReach);
  if (count > 1) root.setAttribute("data-bits-pile-ready", "");

  return {
    show: (index: number) => show(index),
    detach() {
      root.removeEventListener("click", onClick);
      root.removeEventListener("pointerover", onReach);
      root.removeEventListener("focusin", onReach);
      root.removeAttribute("data-bits-pile-ready");
    },
  };
}
