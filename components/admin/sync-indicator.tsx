"use client";

import { useEffect, useState } from "react";
import { ConnectivityPill } from "./connectivity-pill";
import { SyncDrawer } from "./sync-drawer";

/**
 * The pill and the panel it opens, kept together so the studio header only has
 * to mount one thing.
 *
 * The panel opens by itself the first time a conflict appears. Two versions of
 * the same piece of writing is the one state that must not wait to be noticed:
 * everything else here can be checked when convenient.
 */
export function SyncIndicator() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let announced = false;
    return subscribeConflicts(() => {
      if (announced) return;
      announced = true;
      setOpen(true);
    });
  }, []);

  return (
    <>
      <ConnectivityPill onOpen={() => setOpen(true)} />
      <SyncDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function subscribeConflicts(onConflict: () => void) {
  let cancelled = false;
  let unsubscribe = () => {};

  // Imported lazily so the sync engine is not pulled into the first paint of
  // every studio page that only ever renders the pill.
  void import("@/lib/studio-local/sync").then((module) => {
    if (cancelled) return;
    unsubscribe = module.subscribeSyncEvents((event) => {
      if (event.type === "conflict") onConflict();
    });
  });

  return () => {
    cancelled = true;
    unsubscribe();
  };
}
