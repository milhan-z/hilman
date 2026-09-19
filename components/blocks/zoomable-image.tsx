"use client";

import { Lightbox, ZoomTrigger, useLightbox } from "./lightbox";
import type { LightboxItem } from "./lightbox";

/**
 * The client island that makes one image openable.
 *
 * components/blocks/image-layouts.tsx is a server component and should stay
 * one — the five image presentations are markup and nothing else, and there is
 * no reason to ship them to the browser. Only the *clicking* needs to be
 * interactive, so only the clicking crosses the boundary: this wraps whatever
 * the server rendered, without knowing or caring which presentation produced
 * it.
 *
 * `children` is a server-rendered subtree passed through a client component,
 * which React supports precisely so that a small interactive shell can be put
 * around a large static thing.
 */
export function ZoomableImage({
  item,
  className,
  children,
}: {
  item: LightboxItem;
  className?: string;
  children: React.ReactNode;
}) {
  const lightbox = useLightbox();

  return (
    <>
      <ZoomTrigger
        onOpen={() => lightbox.open(0)}
        label={`Open ${item.caption || item.alt || "photograph"} full size`}
        className={className}
      >
        {children}
      </ZoomTrigger>

      <Lightbox
        items={[item]}
        index={lightbox.index}
        onClose={lightbox.close}
        onIndex={lightbox.setIndex}
      />
    </>
  );
}
