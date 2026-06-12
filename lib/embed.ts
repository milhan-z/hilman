/**
 * Embed helpers — let the CMS accept either a bare share URL or a full
 * `<iframe …>` snippet (which is what providers like Figma/YouTube give you
 * with the "Copy embed code" button) and pull out what we actually need.
 */

/** Extract the iframe `src` (and aspect ratio, if the snippet declares width/height). */
export function parseEmbed(input?: string | null): { src: string; ratio: number | null } {
  if (!input) return { src: "", ratio: null };
  const s = input.trim();

  // full <iframe …> snippet → pull the src
  let src = s;
  const srcMatch = s.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i) ?? s.match(/\bsrc=["']([^"']+)["']/i);
  if (srcMatch) src = srcMatch[1];

  // derive an aspect ratio from width/height attributes when present
  let ratio: number | null = null;
  const w = s.match(/\swidth=["']?(\d+(?:\.\d+)?)/i);
  const h = s.match(/\sheight=["']?(\d+(?:\.\d+)?)/i);
  if (w && h) {
    const wn = parseFloat(w[1]);
    const hn = parseFloat(h[1]);
    if (wn > 0 && hn > 0) ratio = wn / hn;
  }

  return { src: src.trim(), ratio };
}

/** Pull an 11-char YouTube id out of a bare id, a watch/share/shorts URL, or an iframe snippet. */
export function extractYouTubeId(input?: string | null): string {
  if (!input) return "";
  const s = input.trim();
  const srcMatch = s.match(/\bsrc=["']([^"']+)["']/i);
  const candidate = srcMatch ? srcMatch[1] : s;
  const m = candidate.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|v\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(candidate)) return candidate;
  return candidate; // last resort — may be invalid, but don't silently drop input
}
