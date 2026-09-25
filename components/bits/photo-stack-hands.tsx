"use client";

import { Suspense, lazy, useEffect, useRef, useState, type ReactNode } from "react";
import type { LightboxItem } from "../blocks/lightbox";

/**
 * The full-size view, fetched only once somebody reaches for "Look closer"
 * (a pointer over it, focus on it, or the press itself): most visits never
 * open it, and it would be most of the pile's weight.
 */
const Lightbox = lazy(() => import("../blocks/lightbox").then((module) => ({ default: module.Lightbox })));

type Photo = LightboxItem & { index: number };

/**
 * What PhotoStack's hands do — put the top print back underneath, look
 * closer — around a pile the server has already drawn.
 *
 * Kept as small as a client component can be, because the production build
 * folds small client code that only About uses into the chunk every page
 * shares: this is all that goes there. The pile itself is in the HTML; the
 * code that moves it (./photo-stack-controller) and the lightbox arrive in
 * chunks of their own, after the page. Until they have, the pile is simply a
 * pile, and a tap on it does nothing yet.
 */
export function PhotoStackHands({ photos, children }: { photos: Photo[]; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);
  const pile = useRef<{ show: (index: number) => void } | null>(null);
  const [lookingAt, setLookingAt] = useState<number | null>(null);
  const [reaching, setReaching] = useState(false);
  // Read by the controller's callbacks, which are created once.
  const photoList = useRef(photos);
  photoList.current = photos;

  useEffect(() => {
    const node = root.current;
    if (!node) return;
    let detach: (() => void) | undefined;
    let gone = false;
    import("./photo-stack-controller").then(({ attachPhotoStack }) => {
      if (gone) return;
      const controller = attachPhotoStack(node, {
        reach: () => setReaching(true),
        look: (index) => {
          setReaching(true);
          setLookingAt(photoList.current.findIndex((photo) => photo.index === index));
        },
      });
      pile.current = controller;
      detach = controller.detach;
    });
    return () => {
      gone = true;
      detach?.();
    };
  }, []);

  return (
    <div ref={root}>
      {children}
      {reaching && (
        <Suspense fallback={null}>
          <Lightbox
            items={photos}
            index={lookingAt}
            onClose={() => setLookingAt(null)}
            onIndex={(photo) => {
              setLookingAt(photo);
              // Closing the lightbox leaves the pile at the photograph you
              // were looking at.
              pile.current?.show(photos[photo].index);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
