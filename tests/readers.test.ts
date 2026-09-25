import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  formatReaders,
  hasStudioSession,
  isLikelyBot,
  readStorageKey,
  recallReaders,
  rememberReaders,
  seenStorageKey,
  READ_DWELL_MS,
  READ_WINDOW_MS,
} from "../lib/readers";
import { GET, POST } from "../app/api/reads/route";

/**
 * What counts as a reader, and how the count is printed.
 *
 * The SQL side — drafts never counted, visitors unable to write the table, a
 * visit never moving the Studio's version — is in tests/reader-counts.test.ts.
 * This is the side in front of it: the rules that decide whether a request is
 * a reader at all.
 */

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const BROWSER =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

/* ── printing it ──────────────────────────────────────────── */

test("nothing is printed until somebody has read it", () => {
  for (const value of [undefined, null, 0, -3, Number.NaN]) {
    assert.equal(formatReaders(value as number), null, String(value));
  }
});

test("one reader is a reader, and more are readers", () => {
  assert.equal(formatReaders(1), "1 reader");
  assert.equal(formatReaders(2), "2 readers");
  assert.equal(formatReaders(999), "999 readers");
});

test("large counts are compact", () => {
  assert.equal(formatReaders(1000), "1K readers");
  assert.equal(formatReaders(1250), "1.3K readers");
  assert.equal(formatReaders(48_200), "48.2K readers");
});

/* ── who is not a reader ──────────────────────────────────── */

test("ordinary browsers are readers", () => {
  for (const ua of [
    BROWSER,
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 14; SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/25.0 Chrome/121.0.0.0 Mobile Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0",
  ]) {
    assert.equal(isLikelyBot(ua), false, ua);
  }
});

test("crawlers, link previews and automated browsers are not", () => {
  for (const ua of [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "WhatsApp/2.23.20.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/131.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36 Chrome-Lighthouse",
    "curl/8.5.0",
    "",
  ]) {
    assert.equal(isLikelyBot(ua), true, ua || "(no user agent)");
  }
});

test("a Studio session is recognised by its cookie, chunked or not", () => {
  assert.equal(hasStudioSession("sb-abcdefgh-auth-token=base64-eyJ"), true);
  assert.equal(hasStudioSession("theme=dark; sb-abcdefgh-auth-token.0=base64-eyJ; x=1"), true);
  assert.equal(hasStudioSession("theme=dark; hilman-theme=light"), false);
  assert.equal(hasStudioSession("sb-abcdefgh-auth-token="), false, "an emptied cookie is a signed-out browser");
  assert.equal(hasStudioSession(null), false);
});

test("a read is a few seconds on screen, once a day per entry", () => {
  assert.ok(READ_DWELL_MS >= 2000 && READ_DWELL_MS <= 10_000);
  assert.equal(READ_WINDOW_MS, 24 * 60 * 60 * 1000);
  assert.equal(readStorageKey("journal", ID), `hilman-read:journal:${ID}`);
});

/* ── what a browser remembers having shown ────────────────── */

function memory() {
  const items = new Map<string, string>();
  return {
    items,
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => void items.set(key, value),
  };
}

test("a refresh starts from what this browser already showed, not from an older page", () => {
  // Read, see 2, refresh: the static page still says 1. The memory is what
  // keeps the number from counting backwards while the live one is fetched.
  const store = memory();
  const now = 1_790_000_000_000;
  assert.equal(recallReaders(store, "journal", ID, now), null, "nothing shown yet");

  rememberReaders(store, "journal", ID, 2, now);
  assert.equal(recallReaders(store, "journal", ID, now + 1000), 2);
  assert.equal(recallReaders(store, "project", ID, now), null, "per kind");
  assert.ok(store.items.has(seenStorageKey("journal", ID)));
  assert.notEqual(seenStorageKey("journal", ID), readStorageKey("journal", ID), "apart from the once-a-day mark");
});

test("the memory only ever rises, and lasts a day", () => {
  const store = memory();
  const now = 1_790_000_000_000;
  rememberReaders(store, "journal", ID, 5, now);
  rememberReaders(store, "journal", ID, 3, now + 10);
  assert.equal(recallReaders(store, "journal", ID, now + 20), 5, "a lower number never replaces a higher one");
  assert.equal(recallReaders(store, "journal", ID, now + READ_WINDOW_MS + 30), null, "a day later every page is newer");
  rememberReaders(store, "journal", ID, 0, now);
  rememberReaders(store, "journal", ID, Number.NaN, now);
  assert.equal(recallReaders(store, "journal", ID, now + 20), 5, "nothing is not a count");
});

test("a browser that refuses storage, or holds junk, just has no memory", () => {
  const refusing = {
    getItem: () => {
      throw new Error("SecurityError");
    },
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  assert.doesNotThrow(() => rememberReaders(refusing, "journal", ID, 3));
  assert.equal(recallReaders(refusing, "journal", ID), null);
  assert.equal(recallReaders(undefined, "journal", ID), null);

  const junk = memory();
  for (const raw of ["not json", "42", '{"n":"2","t":1}', '{"n":2}', '{"n":-1,"t":1790000000000}']) {
    junk.items.set(seenStorageKey("journal", ID), raw);
    assert.equal(recallReaders(junk, "journal", ID, 1_790_000_000_000), null, raw);
  }
});

test("cards start from the same memory, and an empty card row takes no room", () => {
  const component = source("components/reader-tally.tsx");
  assert.match(component, /export function ReaderTally/);
  assert.match(component, /recallReaders\(browserStorage\(\), kind, id\)/);
  // Its own module so the cards on every list do not download the rolling
  // Tally that only the entry page's count uses.
  assert.ok(!/bits\/tally/.test(component), "the card count never brings the roll with it");
  for (const card of ["components/journal-card.tsx", "components/project-card.tsx"]) {
    assert.match(source(card), /<ReaderTally/, `${card} shows the remembered count`);
  }
  assert.match(source("components/project-card.tsx"), /empty:hidden/);
});

/* ── the route ────────────────────────────────────────────── */

const post = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request("http://localhost/api/reads", {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": BROWSER, ...headers },
      body: typeof body === "string" ? body : JSON.stringify(body),
    })
  );

test("the route refuses anything that does not name an entry", async () => {
  for (const body of ["not json", {}, { kind: "page", id: ID }, { kind: "project", id: "12" }]) {
    const response = await post(body);
    assert.equal(response.status, 400, JSON.stringify(body));
  }
});

test("a crawler or the author is answered without being counted", async () => {
  const cases: Record<string, string>[] = [{ "user-agent": "Googlebot/2.1" }, { cookie: "sb-abc-auth-token=x" }];
  for (const headers of cases) {
    const response = await post({ kind: "project", id: ID }, headers);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { reads: null });
    assert.equal(response.headers.get("cache-control"), "no-store");
  }
});

const lookup = (query: string) => GET(new Request(`http://localhost/api/reads?${query}`));

test("the live number is asked for by entry, and nothing else", async () => {
  for (const query of ["", "kind=page&id=" + ID, "kind=project&id=12", "kind=journal"]) {
    const response = await lookup(query);
    assert.equal(response.status, 400, query || "(no query)");
  }
  // No database in this environment: a well-formed question gets "no number",
  // never an error, and is never cached — it is the live number or nothing.
  const response = await lookup(`kind=journal&id=${ID}`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reads: null });
  assert.equal(response.headers.get("cache-control"), "no-store");
});

test("an entry page asks for the live count as it opens, not only when it counts", () => {
  // A static page is regenerated only when asked for after a minute, so the
  // number built into it can be several reads old — or, before its first
  // read, no number at all. That is how the count went missing from the
  // entry pages while the lists already showed it.
  const component = source("components/reader-count.tsx");
  assert.match(component, /fetch\(`\/api\/reads\?kind=\$\{kind\}&id=\$\{encodeURIComponent\(id\)\}`/);
  const lookupAt = component.indexOf("/api/reads?kind=");
  const windowAt = component.indexOf("READ_WINDOW_MS)");
  assert.ok(lookupAt > 0 && lookupAt < windowAt, "asked before the once-a-day check can return early");
});

test("the page ships no Supabase client to count with", () => {
  // The count is recorded through the route, so the public bundle stays as
  // small as the performance work left it.
  const component = source("components/reader-count.tsx");
  assert.ok(!component.includes("supabase"), "the client component never talks to Supabase");
  assert.match(component, /fetch\("\/api\/reads"/);
  assert.match(component, /visibilityState === "visible"/, "only time on screen counts");
});
