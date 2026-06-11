"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Rotating identity line: Creative [Designer] → [Editor] → …
 * Reduced motion → static first role + the full list below stays readable.
 */
export function HeroRoles({ roles }: { roles: string[] }) {
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (reduced || roles.length < 2) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % roles.length), 2600);
    return () => clearInterval(t);
  }, [reduced, roles.length]);

  const current = roles[index] ?? roles[0] ?? "Technologist";

  return (
    <span className="inline-flex items-baseline gap-[0.35em]">
      <span>Creative</span>
      <span
        aria-live="polite"
        className="hl-mark relative inline-block min-w-[5ch] text-pen"
      >
        {reduced ? (
          <span>{roles[0]}</span>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={current}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -14 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="inline-block"
            >
              {current}
            </motion.span>
          </AnimatePresence>
        )}
      </span>
    </span>
  );
}
