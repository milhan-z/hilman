"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { mediaSrc } from "@/lib/cloudinary";
import { cn } from "@/lib/utils";

/**
 * A photograph, looked at properly.
 *
 * Every presentation in this system shows media at the size the *layout*
 * wanted: a grid tile, a fanned card, a sliver of an accordion. That is the
 * right default for reading a page, and the wrong one for the moment somebody
 * actually wants to see the picture. This is that moment — click, and the
 * photograph fills the screen at the size it deserves.
 *
 * ── it is a dialog, and behaves like one ──
 *
 * Opening it takes focus, closing it gives focus back to the thing that was
 * clicked, Escape closes, Tab cannot wander out into the page behind, and the
 * page behind does not scroll. None of that is decoration: a full-screen
 * overlay that leaves the document scrollable underneath is how a phone user
 * ends up lost, and one that swallows focus is how a keyboard user gets stuck.
 *
 * ── one at a time, and always the same one ──
 *
 * The overlay renders through a portal on `document.body`, because every
 * ancestor with `transform`, `filter` or `backdrop-filter` becomes a
 * containing block for `position: fixed` — a trap this repository has already
 * been caught by once, in the Studio's sync sheet. The gallery cards are
 * rotated. Rendering in place would pin the overlay to a tilted card.
 *
 * ── moving between photographs ──
 *
 * A gallery hands the whole set in, so the arrows and a swipe move through it
 * without closing and reopening. A single image block hands in one item and
 * the controls disappear on their own.
 */

export interface LightboxItem {
  src: string;
  alt: string;
  caption?: string;
}

/** Open state for one gallery. Local, because only one can be open anyway. */
export function useLightbox() {
  const [index, setIndex] = useState<number | null>(null);
  const open = useCallback((at: number) => setIndex(at), []);
  const close = useCallback(() => setIndex(null), []);
  return { index, open, close, setIndex };
}

/**
 * The clickable wrapper a presentation puts around its media.
 *
 * A real `<button>`, so it is reachable by Tab and activated by Enter and
 * Space without any of that being reimplemented. `sr-only` text says what
 * pressing it does, because "image" announced on its own tells a screen reader
 * user nothing about the interaction.
 */
export function ZoomTrigger({
  onOpen,
  label,
  className,
  children,
}: {
  onOpen: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group/zoom relative block w-full cursor-zoom-in text-left",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pen",
        className
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

const EASE = [0.16, 1, 0.3, 1] as const;

export function Lightbox({
  items,
  index,
  onClose,
  onIndex,
}: {
  items: LightboxItem[];
  /** Null when closed. */
  index: number | null;
  onClose: () => void;
  onIndex: (next: number) => void;
}) {
  const reduced = useReducedMotion();
  const closeRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  // A portal needs a DOM to aim at, and the server does not have one.
  useEffect(() => setMounted(true), []);

  const isOpen = index !== null;
  const many = items.length > 1;

  const go = useCallback(
    (delta: number) => {
      if (index === null || !many) return;
      // Wraps, because reaching the end of a set of photographs and being
      // stopped is a worse surprise than coming back round to the first.
      onIndex((index + delta + items.length) % items.length);
    },
    [index, items.length, many, onIndex]
  );

  /* ── focus and scroll: strictly on the open/close transition ──

     Deliberately separate from the keyboard listener below, and depending on
     nothing but `isOpen`. Folded together, the effect re-ran every time the
     index changed — because the key handler closes over `go`, which closes
     over `index` — and each re-run re-captured "what to give focus back to"
     while focus was already inside the dialog. Closing then returned focus to
     the dialog's own close button, which by that point no longer existed, so
     it landed on <body> and the page lost its place. */
  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocused = document.activeElement;
    closeRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      // Back to the photograph that was clicked, so the page does not jump.
      if (previouslyFocused instanceof HTMLElement) previouslyFocused.focus();
    };
  }, [isOpen]);

  /* ── the keyboard, which may re-subscribe as freely as it likes ── */
  useEffect(() => {
    if (!isOpen) return;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === "ArrowRight") {
        event.preventDefault();
        go(1);
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        go(-1);
        return;
      }
      if (event.key !== "Tab") return;

      // Keep Tab inside the dialog. Without this it walks straight into the
      // page underneath, which is still there and still focusable.
      const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!focusable || focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, go, onClose]);

  /* ── swipe, for the case where there is no keyboard ── */
  const touch = useRef<{ x: number; y: number } | null>(null);
  const onTouchStart = (event: React.TouchEvent) => {
    const point = event.changedTouches[0];
    touch.current = { x: point.clientX, y: point.clientY };
  };
  const onTouchEnd = (event: React.TouchEvent) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const point = event.changedTouches[0];
    const dx = point.clientX - start.x;
    const dy = point.clientY - start.y;
    // Horizontal enough to be a swipe rather than a scroll that drifted.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
  };

  if (!mounted || index === null) return null;
  const item = items[index];
  if (!item) return null;

  const src = mediaSrc(item.src, { width: 2000 });
  if (!src) return null;

  return createPortal(
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label={item.caption || item.alt || "Photograph"}
      initial={reduced ? false : { opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.18, ease: EASE }}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      // The backdrop closes; anything inside it does not. Checking the target
      // is the element itself is what separates the two without a second
      // absolutely-positioned layer to catch clicks.
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      /* An explicit rgba rather than a neutral-scale token with an opacity
          modifier on it: the semantic colours are bare `var(--x)`, so a
          modifier applied to one compiles to nothing at all and this backdrop
          would simply not be drawn. See tests/tailwind-tokens.test.ts, which
          catches exactly that — including, twice now, when the offending
          class name appears only inside a comment explaining the rule. */
      className="fixed inset-0 z-[100] flex flex-col bg-[rgba(10,9,8,0.94)] p-3 backdrop-blur-sm sm:p-6"
      style={{
        // Respect a notch, and the home indicator underneath it.
        paddingTop: "max(0.75rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="flex shrink-0 items-center justify-between gap-3">
        <p className="font-mono text-2xs uppercase tracking-wide text-cream-soft">
          {many ? `${index + 1} / ${items.length}` : ""}
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-cream-line text-cream transition-colors hover:border-cream hover:bg-cream hover:text-cream-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* min-h-0 so the image is what shrinks in a short window, rather than
          the caption being pushed off the bottom of the screen. */}
      {/* `relative`, because the arrows float over this box rather than sitting
          in the flow beside the photograph. In the flow they competed with
          `max-w-full` for the same horizontal space and lost, which at 390px
          meant both of them hanging half off the screen. Floating them also
          means the image is the same size whether there are arrows or not. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center py-3"
        onClick={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        {many && <Arrow side="left" onClick={() => go(-1)} />}
        <motion.img
          key={index}
          src={src}
          alt={item.alt}
          initial={reduced ? false : { opacity: 0, scale: 0.985 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.2, ease: EASE }}
          // Fits the box without cropping and without stretching — the whole
          // point of opening it was to see the photograph, all of it.
          className="max-h-full min-h-0 w-auto max-w-full rounded-sm object-contain"
        />

        {many && <Arrow side="right" onClick={() => go(1)} />}
      </div>

      {item.caption && (
        <p className="shrink-0 text-center font-hand text-lg text-cream-soft">{item.caption}</p>
      )}
    </motion.div>,
    document.body
  );
}

function Arrow({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === "left" ? "Previous photograph" : "Next photograph"}
      className={cn(
        "absolute top-1/2 z-10 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full",
        "border border-cream-line bg-[rgba(10,9,8,0.55)] text-cream backdrop-blur-sm transition-colors",
        "hover:border-cream hover:bg-cream hover:text-cream-ink",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cream",
        side === "left" ? "left-0 sm:left-2" : "right-0 sm:right-2"
      )}
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={side === "left" ? "M15 18l-6-6 6-6" : "M9 18l6-6-6-6"} />
      </svg>
    </button>
  );
}
