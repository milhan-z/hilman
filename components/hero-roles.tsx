"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * "Creative [Role]" — the role inside yellow brackets swaps with a
 * blur + vertical slide, like flipping index cards. Accessible: the
 * live label announces the current role; the visual pieces are hidden.
 */
export function HeroRoles({
  roles,
  prefix = "Creative",
  interval = 2600,
}: {
  roles: string[];
  prefix?: string;
  interval?: number;
}) {
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    if (reduced || roles.length < 2) return;
    const t = setInterval(() => setI((p) => (p + 1) % roles.length), interval);
    return () => clearInterval(t);
  }, [reduced, roles.length, interval]);

  const role = roles[i] ?? roles[0] ?? "Technologist";

  return (
    <span className="inline-flex items-center gap-[0.3em]" role="text" aria-label={`${prefix} ${role}`}>
      <span aria-hidden>{prefix}</span>
      <span aria-hidden className="inline-flex items-center gap-[0.1em]">
        <span className="text-pen/50">[</span>
        <span className="relative inline-grid">
          {reduced ? (
            <span className="text-pen">{role}</span>
          ) : (
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={role}
                initial={{ y: "0.55em", opacity: 0, filter: "blur(6px)" }}
                animate={{ y: 0, opacity: 1, filter: "blur(0px)" }}
                exit={{ y: "-0.55em", opacity: 0, filter: "blur(6px)" }}
                transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
                className="col-start-1 row-start-1 whitespace-nowrap text-pen"
              >
                {role}
              </motion.span>
            </AnimatePresence>
          )}
        </span>
        <span className="text-pen/50">]</span>
      </span>
    </span>
  );
}
