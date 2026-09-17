"use client";

import { useEffect, useSyncExternalStore } from "react";
import { migrateLegacyDrafts } from "@/lib/studio-local/drafts";
import {
  flushOutbox,
  getSyncState,
  installSyncTriggers,
  refreshSyncState,
  subscribeSync,
  type SyncState,
} from "@/lib/studio-local/sync";

/**
 * The parts of the studio that have to be running whether or not a particular
 * screen is open: the service worker, the local database, and the queue.
 *
 * Mounted once from the admin layout. Nothing is rendered — the visible half
 * lives in <ConnectivityPill /> and <SyncDrawer />.
 */

const serverSnapshot: SyncState = {
  reachable: true,
  syncing: false,
  queued: 0,
  blocked: 0,
  conflicts: 0,
  media: 0,
  lastSyncedAt: null,
  lastError: null,
  lastFailure: null,
  blockedPrompts: 0,
  uploads: { pending: 0, failed: 0, noun: "photo" },
};

/** Live queue and connectivity state, shared by every studio screen. */
export function useSyncState(): SyncState {
  return useSyncExternalStore(subscribeSync, getSyncState, () => serverSnapshot);
}

export { flushOutbox, refreshSyncState };

export function StudioRuntime() {
  const state = useSyncState();

  /**
   * The count on the home-screen icon.
   *
   * It exists so that "I wrote something on the train" is answerable without
   * opening the app. iOS supports it for installed web apps from 16.4; where
   * it is unsupported the calls simply are not there, and nothing else
   * changes.
   */
  useEffect(() => {
    const waiting = state.queued + state.media + state.blocked + state.conflicts;
    const badge = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (!badge.setAppBadge || !badge.clearAppBadge) return;

    // Badge permission can be refused; that is not worth an error in the log.
    void (waiting > 0 ? badge.setAppBadge(waiting) : badge.clearAppBadge()).catch(() => {});
  }, [state.queued, state.media, state.blocked, state.conflicts]);

  useEffect(() => {
    // Anything written by the previous localStorage-only version moves first,
    // so an upgrade cannot be the thing that loses an unsaved draft.
    void migrateLegacyDrafts();
    const uninstall = installSyncTriggers();
    return uninstall;
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    /**
     * In development the offline shell is a liability, not a feature.
     *
     * It caches build assets, and `next dev` rebuilds them under new hashes
     * on every edit — so a worker installed during one session keeps serving
     * the chunks it remembers, and a change to a component quietly does not
     * appear. Worse, the stale chunk and the fresh server render disagree and
     * the page fails to hydrate, which looks like a bug in the code you just
     * wrote. Any worker left over from a production visit is removed, so
     * `localhost` is always the build that is actually on disk.
     */
    if (process.env.NODE_ENV !== "production") {
      void navigator.serviceWorker
        .getRegistrations()
        // Only this studio's worker. Unregistering everything on the origin
        // would take out any other worker that happens to share localhost —
        // another project on the same port, a tool running alongside.
        .then((registrations) =>
          Promise.all(
            registrations
              .filter((registration) => {
                const script =
                  registration.active?.scriptURL ??
                  registration.installing?.scriptURL ??
                  registration.waiting?.scriptURL ??
                  "";
                return script.endsWith("/sw.js");
              })
              .map((registration) => registration.unregister())
          )
        )
        .then(async (removed) => {
          if (!removed.some(Boolean)) return;
          // Its caches outlive it, and they hold the stale chunks.
          if ("caches" in window) {
            const keys = await caches.keys();
            await Promise.all(
              keys.filter((key) => key.startsWith("hilman-studio")).map((key) => caches.delete(key))
            );
          }
          console.info("[studio] removed the offline shell for development.");
        })
        .catch(() => {
          /* nothing to clean up */
        });
      return;
    }

    // Registered from the studio rather than the root layout: a reader of the
    // public notebook has no use for an offline CMS shell.
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).catch((error) => {
      console.warn("[studio] the offline shell could not be installed:", error);
    });
  }, []);

  return null;
}

/**
 * Clears everything this browser is holding. Called on sign-out: drafts and
 * queued saves are unpublished work, and a shared phone should not keep them
 * after the door is closed.
 */
export async function forgetLocalStudioData() {
  const { dbClearAll } = await import("@/lib/studio-local/db");
  await dbClearAll();
  await refreshSyncState();
}
