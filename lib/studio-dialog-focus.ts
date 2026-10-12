/** Focus containment shared by Studio dialogs, including nested media pickers. */
const dialogs: HTMLElement[] = [];

function controls(panel: HTMLElement): HTMLElement[] {
  return Array.from(panel.querySelectorAll<HTMLElement>(
    'a[href], button, input, select, textarea, [contenteditable="true"], [tabindex]'
  )).filter((element) =>
    (element.tabIndex >= 0 || (element.isContentEditable && element.getAttribute("tabindex") !== "-1")) &&
    !element.matches(':disabled, [hidden], [aria-hidden="true"], input[type="hidden"]') &&
    !element.closest('[inert], [hidden], [aria-hidden="true"]') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility !== "hidden"
  );
}

/** Register only once per opening; changing field values must never reset focus. */
export function containDialogFocus(
  panel: HTMLElement,
  onClose: () => void,
  initialFocus?: HTMLElement | null
): () => void {
  const previous = document.activeElement as HTMLElement | null;
  dialogs.push(panel);
  const topmost = () => dialogs.at(-1) === panel;
  (initialFocus ?? panel).focus({ preventScroll: true });

  function onKeyDown(event: KeyboardEvent) {
    if (!topmost()) return;
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopImmediatePropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;
    const items = controls(panel);
    const first = items[0];
    const last = items.at(-1);
    const active = document.activeElement;
    if (!first || !last) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
    } else if (!panel.contains(active) || active === panel) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    } else if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onFocus(event: FocusEvent) {
    if (topmost() && !panel.contains(event.target as Node)) {
      panel.focus({ preventScroll: true });
    }
  }

  document.addEventListener("keydown", onKeyDown, true);
  document.addEventListener("focusin", onFocus, true);
  return () => {
    const wasTopmost = topmost();
    const index = dialogs.lastIndexOf(panel);
    if (index !== -1) dialogs.splice(index, 1);
    document.removeEventListener("keydown", onKeyDown, true);
    document.removeEventListener("focusin", onFocus, true);
    if (wasTopmost && previous?.isConnected) previous.focus({ preventScroll: true });
  };
}
