"use client";

import { useEffect, useState } from "react";

/**
 * True while the reader is scrolling *down* through the page, so the header can
 * step out of the way and give a phone screen its full height back.
 *
 * The rules are there to stop it flickering: nothing happens near the top of
 * the page, and a direction change has to be worth more than a few pixels
 * before the bar moves — otherwise the rubber-band at the end of a scroll, or a
 * thumb resting on the glass, would flap it open and shut.
 */
export function useTuckedHeader({ threshold = 140, tolerance = 8 } = {}) {
  const [tucked, setTucked] = useState(false);

  useEffect(() => {
    let last = window.scrollY;
    let frame = 0;

    const measure = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - last;
      if (Math.abs(delta) < tolerance) return;
      last = y;
      // Above the threshold the header always stays: that region includes the
      // masthead itself, and hiding it there just looks broken.
      setTucked(y > threshold && delta > 0);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(measure);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [threshold, tolerance]);

  return tucked;
}
