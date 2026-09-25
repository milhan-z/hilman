/**
 * How many people have read something, and what counts as one of them.
 *
 * The database only promises that a count moves by one and never for a draft
 * (supabase/migrations/0013_reader_counts.sql). What a *read* is gets decided
 * here, on the way in, and the rules are deliberately modest — this is a
 * personal notebook's "people who stopped by", not analytics:
 *
 *   - the page was actually on screen for a few seconds (READ_DWELL_MS), so a
 *     tab opened and closed in passing is not a reader;
 *   - one read per browser per entry per day (READ_WINDOW_MS), so refreshing
 *     is not a reader either;
 *   - no crawlers, link previewers or headless browsers (isLikelyBot);
 *   - not the author, while signed in to the Studio (hasStudioSession).
 *
 * Nothing here stores who anybody is. The browser remembers when it last
 * counted an entry, and the server looks only at headers the request already
 * carries.
 */

export type ReadKind = "project" | "journal";

/** Seconds on screen before a visit is a read. */
export const READ_DWELL_MS = 4000;

/** One read per browser per entry in this window. */
export const READ_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Where the browser remembers when it last counted an entry. */
export const readStorageKey = (kind: ReadKind, id: string) => `hilman-read:${kind}:${id}`;

/** Where the browser remembers the highest count it has shown for an entry. */
export const seenStorageKey = (kind: ReadKind, id: string) => `hilman-readers:${kind}:${id}`;

type Store = Pick<Storage, "getItem" | "setItem">;

/**
 * localStorage, or nothing. Reading the property itself throws in a browser
 * with site data blocked, so every caller goes through this.
 */
export function browserStorage(): Store | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

/**
 * The highest count this browser has shown for an entry in the last day, or
 * null.
 *
 * The pages are static, and a static page can be older than the number its
 * reader has already seen: you read an entry, it says "2 readers", you
 * refresh, and the page arrives with the 1 it was built with. The live count
 * corrects it a moment later — a moment spent counting backwards. So the
 * browser keeps what it has shown, and a page never starts below it.
 *
 * Only a day, like the read itself: by then every page has been rebuilt, and
 * a count the owner reset should not be held up by an old memory.
 */
export function recallReaders(
  store: Store | undefined,
  kind: ReadKind,
  id: string,
  now = Date.now()
): number | null {
  try {
    const raw = store?.getItem(seenStorageKey(kind, id));
    if (!raw) return null;
    const { n, t } = JSON.parse(raw) as { n?: unknown; t?: unknown };
    if (typeof n !== "number" || !Number.isFinite(n) || n < 1) return null;
    if (typeof t !== "number" || now - t > READ_WINDOW_MS || t - now > 60_000) return null;
    return Math.floor(n);
  } catch {
    return null;
  }
}

/** Remembers a count this browser has shown — never lowering what it holds. */
export function rememberReaders(
  store: Store | undefined,
  kind: ReadKind,
  id: string,
  count: number,
  now = Date.now()
): void {
  if (!Number.isFinite(count) || count < 1) return;
  try {
    const held = recallReaders(store, kind, id, now) ?? 0;
    store?.setItem(seenStorageKey(kind, id), JSON.stringify({ n: Math.max(held, Math.floor(count)), t: now }));
  } catch {
    // Full or refused: the page simply starts from its own number next time.
  }
}

/**
 * The count as the page prints it, or null when there is nothing to print.
 *
 * Zero is null on purpose: "0 readers" on a new entry reads as a verdict, and
 * the first real visitor turns it into a number anyway.
 */
export function formatReaders(count: number | null | undefined): string | null {
  if (typeof count !== "number" || !Number.isFinite(count) || count < 1) return null;
  const n = Math.floor(count);
  if (n === 1) return "1 reader";
  if (n < 1000) return `${n} readers`;
  const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  return `${compact} readers`;
}

/**
 * Crawlers, link unfurlers, uptime checks and automated browsers.
 *
 * Not exhaustive and not meant to be: anything that runs JavaScript and waits
 * four seconds while claiming to be a person gets counted. That is an honest
 * limit of a counter with no tracking behind it.
 */
const BOT = /bot|crawl|spider|slurp|scrap|preview|fetch|monitor|headless|lighthouse|pagespeed|phantom|puppeteer|playwright|selenium|curl|wget|python|node-fetch|axios|http-client|facebookexternalhit|embedly|whatsapp|telegram|discord|skype|vercel/i;

export function isLikelyBot(userAgent: string | null | undefined): boolean {
  const ua = (userAgent ?? "").trim();
  return !ua || BOT.test(ua);
}

/**
 * Whether the request comes from a browser signed in to the Studio.
 *
 * The public pages are static and never read cookies, but the request that
 * records a read does, and a Supabase session cookie
 * (`sb-<project>-auth-token`, possibly split into `.0`, `.1`, …) there means
 * the author looking at their own work. Presence is enough: this decides
 * whether to count, not who anybody is, so nothing is verified or decoded.
 */
export function hasStudioSession(cookieHeader: string | null | undefined): boolean {
  if (!cookieHeader) return false;
  return cookieHeader
    .split(";")
    .some((part) => /^\s*sb-[^=]+-auth-token(\.\d+)?=./.test(part));
}
