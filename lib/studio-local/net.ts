"use client";

import { TimeoutError } from "./retry-policy";

/**
 * A request that is allowed to give up.
 *
 * Nothing in the studio had a timeout. `flushOutbox` shares one promise
 * between every caller precisely so three triggers landing in the same second
 * cannot send three copies of the queue — which is right, and which also means
 * one request that never answers owns the queue for as long as the tab lives.
 * A captive-portal WiFi that accepts a connection and then says nothing is
 * exactly that, and it is a normal thing to walk into.
 *
 * Giving up is safe because of everything else: the mutation is still in the
 * outbox, its claim is handed back, and the server's ledger recognises the id
 * if the request did in fact arrive. So the worst case of an early timeout is
 * one wasted round trip, and the worst case of no timeout is a studio that
 * silently stops syncing until it is reloaded.
 *
 * `impl` is injected only by tests, which need a request that hangs on purpose.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  impl: typeof fetch = fetch
): Promise<Response> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;

  // Raced rather than relying on the abort alone. A well-behaved fetch rejects
  // when its signal fires, but the caller's release must not *depend* on that:
  // a polyfill, a service worker or an intercepting proxy that ignores the
  // signal would otherwise hold the single shared flush promise open for the
  // life of the tab, which is the exact failure this is here to prevent.
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new TimeoutError());
    }, timeoutMs);
  });

  try {
    return await Promise.race([impl(url, { ...init, signal: controller.signal }), deadline]);
  } catch (error) {
    // An abort we caused is a timeout, and saying so keeps it out of the
    // "permanent failure" bucket that an unrecognised error falls into.
    if (controller.signal.aborted) throw new TimeoutError();
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * How long each kind of request may take.
 *
 * Generous, because the whole point of this studio is that it works on a bad
 * connection — these are ceilings for "this is never coming back", not targets.
 */
export const SYNC_TIMEOUT_MS = 30_000;
export const UPLOAD_TIMEOUT_MS = 120_000;
/** Signing is a small round trip to our own origin, so it may be impatient. */
export const SIGN_TIMEOUT_MS = 15_000;
