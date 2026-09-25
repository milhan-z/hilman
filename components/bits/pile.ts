/**
 * When each print in a pile starts to land, in milliseconds: 60 apart,
 * closer together for a big pile, so that the last one always starts within
 * 400 ms of the first (docs/HILMAN-BITS.md, rule 3) and a long gallery does
 * not keep the reader waiting for its last photograph.
 *
 * Shared by the gallery Stack (components/blocks/gallery/stack.tsx) and
 * PhotoStack, which drop their prints with the same entrance: `.bits-pile-card`
 * in components/bits/bits.css.
 */
export function settleDelay(index: number, count: number): number {
  if (count < 2 || index < 1) return 0;
  const step = Math.max(40, Math.min(60, 400 / (count - 1)));
  return Math.round(Math.min(index * step, 400));
}
