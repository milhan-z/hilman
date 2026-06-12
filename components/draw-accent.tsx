"use client";

import { motion, useReducedMotion } from "framer-motion";

/**
 * Hand-drawn SVG accent that "draws in" when scrolled into view.
 * Underlines live in a short 200×14 box (stroke near the bottom) so they
 * tuck cleanly under a heading instead of striking through it. Enclosing
 * shapes (circle/bracket) keep the tall 200×60 box.
 */
const SHAPES: Record<string, { d: string; vb: [number, number]; }> = {
  underline: { d: "M3 9 C 45 5, 95 12, 135 8 C 168 5, 186 10, 197 8", vb: [200, 14] },
  underline2: { d: "M3 8 Q 52 13, 102 8 Q 152 3, 197 9", vb: [200, 14] },
  scribble: {
    d: "M3 9 C 20 4, 38 12, 56 8 C 74 4, 92 12, 110 8 C 128 4, 146 12, 164 8 C 178 5, 190 11, 197 8",
    vb: [200, 14],
  },
  wave: { d: "M3 8 Q 27 3, 51 8 Q 75 13, 99 8 Q 123 3, 147 8 Q 171 13, 197 8", vb: [200, 14] },
  zigzag: { d: "M3 10 L 26 5 L 49 10 L 72 5 L 95 10 L 118 5 L 141 10 L 164 5 L 187 10 L 197 7", vb: [200, 14] },
  arrow: { d: "M3 8 C 60 6, 120 10, 188 8 M 173 4 L 197 8 L 173 12", vb: [200, 14] },
  circle: {
    d: "M 100 6 C 162 6 197 28 197 33 C 197 50 156 56 100 56 C 44 56 3 50 3 35 C 3 22 40 6 100 6",
    vb: [200, 60],
  },
  bracket: { d: "M 34 5 L 5 5 L 5 55 L 34 55 M 166 5 L 195 5 L 195 55 L 166 55", vb: [200, 60] },
};

const COLORS: Record<string, string> = {
  yellow: "var(--pen)",
  red: "var(--red)",
  cyan: "var(--cyan)",
  green: "var(--green)",
};

export function DrawAccent({
  variant = "underline",
  color = "yellow",
  width = 180,
  strokeWidth = 3,
  delay = 0.2,
  duration = 0.9,
  className,
}: {
  variant?: keyof typeof SHAPES;
  color?: "yellow" | "red" | "cyan" | "green" | string;
  width?: number;
  strokeWidth?: number;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const shape = SHAPES[variant] ?? SHAPES.underline;
  const [vbW, vbH] = shape.vb;
  const height = Math.round((width / vbW) * vbH);
  const stroke = COLORS[color] ?? color;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${vbW} ${vbH}`}
      fill="none"
      aria-hidden
      className={className}
      style={{ overflow: "visible", display: "block" }}
    >
      <motion.path
        d={shape.d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
        initial={{ pathLength: reduced ? 1 : 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true, margin: "0px 0px -10% 0px" }}
        transition={{ duration: reduced ? 0 : duration, delay: reduced ? 0 : delay, ease: [0.45, 0, 0.2, 1] }}
      />
    </svg>
  );
}
