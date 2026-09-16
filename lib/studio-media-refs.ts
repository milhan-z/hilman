/**
 * Standing in for a photo that has not been uploaded yet.
 *
 * A picture taken in a place with no signal has to go *somewhere* in the
 * meantime, and blocks store a Cloudinary `public_id` — a string. So a stashed
 * photo gets a placeholder string of the same shape, `pending:<uuid>`, which
 * travels through the editor exactly like a real id until the upload finishes
 * and it is swapped for one.
 *
 * The rule that keeps this safe: **a placeholder must never reach the
 * database.** A save whose payload still contains one is held back by the
 * outbox rather than sent, so the site is never asked to render a picture that
 * exists only on a phone. lib/studio-local/sync.ts enforces that; this module
 * is only the string handling, kept pure so it can be tested on its own.
 */

export const PENDING_PREFIX = "pending:";

/** Matches the full placeholder, uuid and all, anywhere inside a string. */
const PENDING_PATTERN =
  /pending:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

export const isPendingRef = (value: unknown): value is string =>
  typeof value === "string" && value.startsWith(PENDING_PREFIX);

/**
 * Every placeholder anywhere inside a value.
 *
 * Walks strings rather than known fields on purpose. A pending id can sit in
 * `public_id`, in a gallery item, in a page's structured data, or inside the
 * JSON string a draft snapshot is stored as — and a check that only knew about
 * the fields we remembered would be a check that eventually misses one.
 */
export function collectPendingRefs(value: unknown): string[] {
  const found = new Set<string>();

  const walk = (node: unknown) => {
    if (typeof node === "string") {
      for (const match of node.match(PENDING_PATTERN) ?? []) found.add(match.toLowerCase());
      return;
    }
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    if (node && typeof node === "object") {
      Object.values(node as Record<string, unknown>).forEach(walk);
    }
  };

  walk(value);
  return [...found];
}

export const hasPendingRefs = (value: unknown): boolean => collectPendingRefs(value).length > 0;

/**
 * Swaps placeholders for the ids Cloudinary gave them.
 *
 * Substring replacement, not equality: it has to reach placeholders embedded in
 * a serialised draft as well as ones sitting alone in a field. Returns the
 * original value untouched when there is nothing to change, so callers can
 * skip a write.
 */
export function replacePendingRefs<T>(value: T, resolved: Record<string, string>): T {
  const entries = Object.entries(resolved);
  if (entries.length === 0) return value;

  const swap = (text: string): string =>
    text.replace(PENDING_PATTERN, (match) => resolved[match.toLowerCase()] ?? match);

  const walk = (node: unknown): unknown => {
    if (typeof node === "string") return swap(node);
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      // Blobs, Dates and anything else exotic are returned as they are: this
      // rewrites content, it does not rebuild objects it does not understand.
      if (!isPlainObject(node)) return node;
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>).map(([key, val]) => [key, walk(val)])
      );
    }
    return node;
  };

  return walk(value) as T;
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}
