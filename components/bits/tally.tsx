"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "../use-reduced-motion";
import { cssDuration } from "./tokens";

export type TallyPart = { kind: "text"; text: string } | { kind: "digit"; from: number; to: number };

/**
 * How one printed number becomes the next, one character column at a time —
 * or null when it cannot roll.
 *
 * Only digits roll, and only against the digit in the same place: "2 readers"
 * to "3 readers" rolls the 2, "1.2K" to "1.3K" rolls the 2 and leaves the 1
 * and the K alone, and the words around them simply change ("1 reader" to
 * "2 readers"). A number that gains or loses a digit (9 to 10, 999 to 1K)
 * has no column to roll in, and is swapped instead.
 */
export function tallyRuns(previous: string, next: string): TallyPart[] | null {
  const runs = (text: string) => text.match(/\d+|\D+/g) ?? [];
  const before = runs(previous);
  const after = runs(next);
  if (before.length !== after.length) return null;
  const parts: TallyPart[] = [];
  for (let i = 0; i < after.length; i++) {
    const digits = /^\d/.test(after[i]);
    if (digits !== /^\d/.test(before[i])) return null;
    if (!digits) {
      parts.push({ kind: "text", text: after[i] });
      continue;
    }
    if (before[i].length !== after[i].length) return null;
    for (let j = 0; j < after[i].length; j++) {
      parts.push({ kind: "digit", from: Number(before[i][j]), to: Number(after[i][j]) });
    }
  }
  return parts;
}


/** Each digit's strip holds 0–9 twice, so 9 → 0 can roll forward, like a counter, not back. */
const STRIP = [..."01234567890123456789"];

const plainNumber = (value: number) => new Intl.NumberFormat("en").format(value);

/**
 * A number that rolls over when it changes in front of you — the digits
 * turning like a mechanical counter, the words around them simply changing.
 *
 * It is text first. What is printed, on the server and at rest, is the
 * number as plain text: copied, found with find-in-page, read by a screen
 * reader like any other word. Only while it rolls is it drawn as columns of
 * digits, and then the real text sits beside them for assistive technology
 * while the columns are aria-hidden. It is not a live region: a count going
 * up by one is not worth interrupting anybody for.
 *
 * It rolls only when the value changes after it is already on screen, and
 * only upwards — the first number shown simply fades in. Reduced motion
 * swaps the number. The roll is the Web Animations API on each column: no
 * frame loop, and nothing for React to re-render until it is over.
 */
export function Tally({
  value,
  format = plainNumber,
  className,
}: {
  value: number;
  /** How the number is printed. From a client component only: functions cannot cross from the server. */
  format?: (value: number) => string | null;
  className?: string;
}) {
  const reduced = useReducedMotion();
  const text = format(value);
  const [shown, setShown] = useState(() => ({ text, value, roll: null as TallyPart[] | null, run: 0 }));

  // A new number: work out the roll while rendering, so the old number is
  // what the first frame shows rather than a flash of the new one.
  if (shown.text !== text) {
    const parts =
      !reduced && shown.text && text && value > shown.value ? tallyRuns(shown.text, text) : null;
    const rolls = parts?.some((part) => part.kind === "digit" && part.from !== part.to) ? parts : null;
    setShown({ text, value, roll: rolls, run: shown.run + 1 });
  }

  const strips = useRef<(HTMLSpanElement | null)[]>([]);
  // Started before the browser paints, so the first frame of the roll is
  // already the old digit, never a flash of the new one.
  useLayoutEffect(() => {
    const roll = shown.roll;
    if (!roll) return;
    const done = () => setShown((current) => (current.run === shown.run ? { ...current, roll: null } : current));
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return done();

    const root = getComputedStyle(document.documentElement);
    const duration = cssDuration(root.getPropertyValue("--motion-reveal"), 520);
    const easing = root.getPropertyValue("--motion-ease-out").trim() || "ease-out";
    const animations = roll.flatMap((part, i) => {
      const strip = strips.current[i];
      if (part.kind !== "digit" || part.from === part.to || !strip?.animate) return [];
      const to = part.to >= part.from ? part.to : part.to + 10;
      return [strip.animate([{ translate: `0 ${-part.from}lh` }, { translate: `0 ${-to}lh` }], { duration, easing })];
    });
    Promise.all(animations.map((animation) => animation.finished)).then(done, done);
    // And back to plain text regardless, a moment after the roll should have
    // ended: an animation that never reports finishing (a paused or throttled
    // tab) must not leave strips of digits where the number is — copying it
    // would paste "01234567890123456789".
    const fallback = setTimeout(done, duration + 250);
    return () => {
      clearTimeout(fallback);
      animations.forEach((animation) => animation.cancel());
    };
  }, [shown.roll, shown.run]);

  if (!text) return null;
  if (!shown.roll) return <span className={cn("bits-tally", className)}>{text}</span>;
  return (
    <span className={cn("bits-tally", className)}>
      <span className="sr-only">{text}</span>
      <span aria-hidden className="bits-tally-roll">
        {shown.roll.map((part, i) =>
          part.kind === "text" ? (
            <span key={`${shown.run}-${i}`}>{part.text}</span>
          ) : (
            <span key={`${shown.run}-${i}`} className="bits-tally-digit">
              <span
                ref={(node) => {
                  strips.current[i] = node;
                }}
                className="bits-tally-strip"
                style={{ translate: `0 ${-(part.to >= part.from ? part.to : part.to + 10)}lh` }}
              >
                {STRIP.map((digit, n) => (
                  <span key={n}>{digit}</span>
                ))}
              </span>
            </span>
          )
        )}
      </span>
    </span>
  );
}
