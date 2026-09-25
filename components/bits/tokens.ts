// Reading the motion tokens (app/globals.css) from JavaScript.
//
// A module of its own, with no component in it, so that a primitive which
// only needs to read a token does not bring another primitive's code along.

/**
 * A CSS duration in milliseconds, or `fallback`.
 *
 * The motion tokens are written in milliseconds, but what the browser hands
 * back is what the build shipped, and the CSS minifier rewrites `520ms` as
 * `.52s`. Read as a bare number that was a roll of half a millisecond — over
 * before it could be seen, on every production page, while every
 * development build looked right.
 */
export function cssDuration(value: string, fallback: number): number {
  const raw = value.trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n < 0) return fallback;
  if (raw.endsWith("ms")) return n;
  if (raw.endsWith("s")) return n * 1000;
  return fallback;
}
