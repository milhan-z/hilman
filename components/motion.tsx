/**
 * Scroll reveals.
 *
 * These are plain server components: they emit `data-reveal` markers, and all
 * the animation lives in CSS (see globals.css) driven by one shared
 * IntersectionObserver in <RevealObserver />. That matters for two reasons:
 *
 *  - Zero client JavaScript. These wrappers are on nearly every section of the
 *    home, about and lab pages; as motion components they pulled the animation
 *    runtime into the bundle of each one.
 *  - They cannot strand content. The hidden state is scoped to `html.js`, a
 *    class set by the inline script in app/layout.tsx, so if scripting is off
 *    or a chunk fails to arrive the content is simply visible rather than
 *    stuck at opacity 0 — which is what a JS-owned `initial` state does.
 *
 * Reduced motion is handled in CSS, so it needs no hook and no re-render.
 */
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

type RevealVariant = "up" | "left" | "right" | "scale" | "blur" | "fade";

/** One-shot reveal when a block scrolls into view. */
export function SectionReveal({
  children,
  delay = 0,
  variant = "up",
  className,
}: {
  children: ReactNode;
  delay?: number;
  variant?: RevealVariant;
  className?: string;
}) {
  return (
    <div
      data-reveal={variant}
      className={className}
      style={delay ? ({ "--reveal-delay": `${delay * 1000}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

/** Stagger container — children using <StaggerItem> animate in sequence. */
export function Stagger({
  children,
  className,
  gap = 0.08,
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
  delay?: number;
}) {
  return (
    <div
      data-reveal-group=""
      className={className}
      style={
        {
          "--stagger-gap": `${gap * 1000}ms`,
          ...(delay ? { "--reveal-delay": `${delay * 1000}ms` } : {}),
        } as CSSProperties
      }
    >
      {children}
    </div>
  );
}

export function StaggerItem({
  children,
  className,
  variant = "up",
}: {
  children: ReactNode;
  className?: string;
  variant?: RevealVariant;
}) {
  return (
    <div data-reveal={variant} className={cn(className)}>
      {children}
    </div>
  );
}
