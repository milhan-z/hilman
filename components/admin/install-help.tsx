"use client";

import { useEffect, useState } from "react";

/**
 * How to get the studio onto the home screen.
 *
 * There is no button to press here, and that is the platform's decision rather
 * than a shortcut. Safari on iOS does not fire `beforeinstallprompt`, so no web
 * page can offer iPhone installation as a tap — Share → Add to Home Screen is
 * the only route, and pretending otherwise produces a button that does nothing.
 *
 * It disappears once the app is already running standalone, and stays
 * dismissed if it is waved away.
 */

const DISMISSED = "hilman-install-help-dismissed";

export function InstallHelp() {
  const [show, setShow] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // Safari's own, non-standard flag for a home-screen web app.
      (window.navigator as { standalone?: boolean }).standalone === true;
    if (standalone) return;

    let dismissed = false;
    try {
      dismissed = window.localStorage.getItem(DISMISSED) === "1";
    } catch {
      /* a blocked storage is not a reason to hide the tip */
    }
    if (dismissed) return;

    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setShow(true);
  }, []);

  if (!show) return null;

  return (
    <aside className="rounded-lg border border-line bg-surface p-4 shadow-card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-ink">Keep the studio on your home screen</h2>
          <p className="mt-1.5 text-sm text-soft">
            {ios ? (
              <>
                Tap <span className="font-semibold text-ink">Share</span>{" "}
                <span aria-hidden>⎋</span>, then{" "}
                <span className="font-semibold text-ink">Add to Home Screen</span>. It opens
                without browser chrome, and drafts you write offline stay put.
              </>
            ) : (
              <>
                Use your browser&apos;s <span className="font-semibold text-ink">Install</span> or{" "}
                <span className="font-semibold text-ink">Add to Home screen</span> menu item. It
                opens in its own window and keeps working without a connection.
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setShow(false);
            try {
              window.localStorage.setItem(DISMISSED, "1");
            } catch {
              /* dismissing for this session only is an acceptable fallback */
            }
          }}
          aria-label="Dismiss the install tip"
          className="-mr-1.5 -mt-1.5 flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded text-faint transition-colors hover:text-ink"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </aside>
  );
}
