import type { CSSProperties } from "react";
import { Pic } from "../cld-image";
import { Button } from "../ui";
import { InView } from "./in-view";
import { PhotoStackHands } from "./photo-stack-hands";
import { settleDelay } from "./pile";

export type PhotoStackItem = {
  /** A photograph (a Cloudinary public_id or a URL). Without one, the print is a handwritten note. */
  src?: string;
  alt?: string;
  title?: string;
  caption?: string;
};

/**
 * Each print's own lean, in degrees, by where it comes in the set: the
 * gallery Stack's angles. A print keeps its lean wherever it is in the pile,
 * the way a photograph does when it is put back underneath the others.
 */
const TILTS = [-2.4, 1.8, -1.1, 2.2, -1.7, 1.2];

/**
 * Photographs in a pile on the desk, the one on top in full and the rest
 * peeking out from under it, with its words beside the pile. Tap the pile —
 * or "Next" — and the top print is lifted off and put back underneath, and
 * the one below is on top. "Look closer" opens the top photograph full size.
 *
 * For a handful of moments that belong together and are best looked at one
 * at a time; the gallery Stack is for photographs laid out side by side.
 *
 * - The whole pile is in the HTML, as the server renders it — a server
 *   component, with no Suspense boundary around it: React 19 sends a large
 *   boundary as a hidden segment that a script reveals, and with JavaScript
 *   off the moments were not there at all (measured). What the hands do (put
 *   a print back, look closer) arrives after the page, in its own chunk:
 *   <PhotoStackHands> and ./photo-stack-controller.
 * - Every print is in the page for a screen reader, in order, with its own
 *   words, whichever one is on top. The words beside the pile repeat the top
 *   print's for the eye, so they are hidden from the reader, and a polite
 *   announcement says which print came up after "Next".
 * - A print with no photograph is a note, in handwriting; nothing to look
 *   closer at.
 * - The pile is dropped onto the desk the first time it comes into view (the
 *   shared pile entrance, bits.css). Putting the top print back is a lift and
 *   a fade on its own, and the pile moves up a notch under it. Reduced motion
 *   swaps the prints at once.
 * - Without JavaScript nothing can be put back, so the pile is dealt out as a
 *   column instead (the <noscript> style below): every photograph and its
 *   words can still be seen.
 */
export function PhotoStack({ items }: { items: PhotoStackItem[] }) {
  const count = items.length;
  if (count === 0) return null;

  const photos = items.flatMap((item, index) =>
    item.src ? [{ index, src: item.src, alt: item.alt || item.title || "", caption: item.caption }] : []
  );

  return (
    <PhotoStackHands photos={photos}>
      <div className="grid items-center gap-8 sm:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] sm:gap-10 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)] lg:gap-16">
        <InView className="mx-auto w-full max-w-[26rem] sm:mx-0">
          <ol className="bits-photo-pile grid pb-3 pr-5" data-bits-pile="pile">
            {items.map((item, index) => (
              <li
                key={index}
                className="bits-pile-card bits-photo-print"
                data-bits-print=""
                data-bits-title={item.title || undefined}
                data-bits-photo={item.src ? "" : undefined}
                style={
                  {
                    zIndex: count - index,
                    "--bits-pile-tilt": `${TILTS[index % TILTS.length]}deg`,
                    // The bottom of the pile lands first, the top print last.
                    "--bits-pile-delay": `${settleDelay(count - 1 - index, count)}ms`,
                    "--bits-print-place": index,
                  } as CSSProperties
                }
              >
                <figure className="bits-photo-paper rounded-sm bg-cream p-3 text-cream-ink shadow-card">
                  {item.src ? (
                    <Pic
                      src={item.src}
                      alt={item.alt || item.title || ""}
                      width={1000}
                      height={800}
                      sizes="(max-width: 640px) 90vw, 420px"
                      className="aspect-[5/4] w-full object-cover"
                    />
                  ) : (
                    <div aria-hidden className="ruled flex aspect-[5/4] w-full items-center justify-center p-6 text-center font-hand text-3xl leading-snug text-cream-ink">
                      {item.title || item.caption}
                    </div>
                  )}
                  {(item.title || item.caption) && (
                    <figcaption className="sr-only px-2 pb-3 pt-5">
                      {item.title && <span className="block font-display text-xl font-medium">{item.title}</span>}
                      {item.caption && <span className="mt-2 block text-sm leading-relaxed text-cream-soft">{item.caption}</span>}
                    </figcaption>
                  )}
                </figure>
              </li>
            ))}
          </ol>
        </InView>

        <div>
          <div aria-hidden className="bits-photo-words">
            {count > 1 && (
              <p className="font-mono text-2xs uppercase tracking-widest text-faint">
                <span data-bits-pile="count">1</span> / {count}
              </p>
            )}
            {items.map((item, index) => (
              <div key={index} data-bits-words="" hidden={index !== 0}>
                {item.title && <p className="mt-3 font-display text-2xl font-medium tracking-tight">{item.title}</p>}
                {item.caption && <p className="mt-2 max-w-md leading-relaxed text-soft">{item.caption}</p>}
              </div>
            ))}
          </div>
          <div className="bits-photo-controls mt-6 flex flex-wrap gap-3">
            {count > 1 && (
              <Button type="button" variant="ghost" data-bits-pile="next">
                Next <span aria-hidden>↻</span>
                <span className="sr-only">: put the top print back underneath</span>
              </Button>
            )}
            {photos.length > 0 && (
              <span data-bits-pile="look" hidden={!items[0].src}>
                <Button type="button" variant="ghost">
                  Look closer <span aria-hidden>⤢</span>
                  <span className="sr-only" data-bits-pile="look-label">
                    {items[0].title ? `: ${items[0].title}` : ""}
                  </span>
                </Button>
              </span>
            )}
          </div>
          <p className="sr-only" aria-live="polite" data-bits-pile="announce" />
        </div>

        {/* Without JavaScript nothing can be put back underneath, so the pile
            is dealt out instead: every print in a column, words and all. */}
        <noscript>
          <style>
            {".bits-photo-pile{gap:1.5rem}.bits-photo-pile>li{grid-area:auto;z-index:auto!important}.bits-photo-pile .bits-photo-paper{translate:none}.bits-photo-pile figcaption{position:static;width:auto;height:auto;margin:0;overflow:visible;clip:auto;white-space:normal}.bits-photo-words,.bits-photo-controls{display:none}"}
          </style>
        </noscript>
      </div>
    </PhotoStackHands>
  );
}
