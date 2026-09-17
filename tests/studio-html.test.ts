import assert from "node:assert/strict";
import test from "node:test";
import { marked } from "marked";
import { htmlHasContent, reviewStudioHtml, sanitizeStudioHtml } from "../lib/studio-html";

/**
 * What pasted markup is allowed to do.
 *
 * Every test here is an attack that must not work, or a piece of ordinary
 * markup that must survive. The first group matters because the studio now
 * accepts HTML from somewhere other than its own form fields; the second
 * because a sanitiser that eats the content is just a slower way of losing it.
 */

/* ── things that must never survive ────────────────────────── */

test("script tags are removed, contents and all", () => {
  const clean = sanitizeStudioHtml('<p>ok</p><script>alert(1)</script>');
  assert.doesNotMatch(clean, /script/i);
  assert.doesNotMatch(clean, /alert/);
  assert.match(clean, /ok/);
});

test("event handler attributes are removed", () => {
  const clean = sanitizeStudioHtml('<img src="x" onerror="alert(1)">');
  assert.doesNotMatch(clean, /onerror/i);
  assert.doesNotMatch(clean, /alert/);
});

test("javascript: links are removed", () => {
  const clean = sanitizeStudioHtml('<a href="javascript:alert(1)">bad</a>');
  assert.doesNotMatch(clean, /javascript:/i);
});

test("data: URLs are refused, including svg smuggling", () => {
  const clean = sanitizeStudioHtml(
    '<img src="data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+">'
  );
  assert.doesNotMatch(clean, /data:/i);
});

test("iframes, objects and embeds are removed with their contents", () => {
  for (const markup of [
    '<iframe src="https://evil.test"></iframe>',
    '<object data="x.swf"></object>',
    '<embed src="x.swf">',
  ]) {
    const clean = sanitizeStudioHtml(markup);
    assert.doesNotMatch(clean, /iframe|object|embed/i, markup);
  }
});

test("style attributes and style blocks are removed", () => {
  const clean = sanitizeStudioHtml(
    '<style>body{display:none}</style><p style="position:fixed;inset:0">hi</p>'
  );
  assert.doesNotMatch(clean, /<style/i);
  assert.doesNotMatch(clean, /position:fixed/i);
  assert.match(clean, /hi/);
});

test("form controls are removed", () => {
  const clean = sanitizeStudioHtml('<form action="/x"><input name="p"><button>go</button></form>');
  assert.doesNotMatch(clean, /<form|<input|<button/i);
});

test("the classic payload from the acceptance test is fully defused", () => {
  const clean = sanitizeStudioHtml(
    '<script>alert(1)</script>\n<img src=x onerror="alert(1)">\n<a href="javascript:alert(1)">bad</a>'
  );
  assert.doesNotMatch(clean, /script|onerror|javascript:/i);
  assert.doesNotMatch(clean, /alert\(1\)/);
});

/* ── things that must survive ──────────────────────────────── */

test("ordinary structural markup and class names are kept", () => {
  const clean = sanitizeStudioHtml(
    '<section class="grid"><h2>Hello</h2><p>Custom <strong>content</strong></p></section>'
  );
  assert.match(clean, /<section class="grid">/);
  assert.match(clean, /<h2>Hello<\/h2>/);
  assert.match(clean, /<strong>content<\/strong>/);
});

test("https images and links are kept", () => {
  const clean = sanitizeStudioHtml('<a href="https://example.com"><img src="https://x.test/a.png" alt="a"></a>');
  assert.match(clean, /href="https:\/\/example\.com"/);
  assert.match(clean, /src="https:\/\/x\.test\/a\.png"/);
  assert.match(clean, /alt="a"/);
});

test("external links are given a safe target", () => {
  const clean = sanitizeStudioHtml('<a href="https://example.com">out</a>');
  assert.match(clean, /target="_blank"/);
  assert.match(clean, /rel="noopener noreferrer"/);
});

test("an internal link is left alone", () => {
  const clean = sanitizeStudioHtml('<a href="/works/thing">in</a>');
  assert.doesNotMatch(clean, /target=/);
});

test("text inside an unknown tag is kept rather than dropped", () => {
  const clean = sanitizeStudioHtml("<center>still words</center>");
  assert.match(clean, /still words/);
});

/* ── explaining what happened ──────────────────────────────── */

test("the review names what it removed", () => {
  const review = reviewStudioHtml('<script>x</script><p onclick="y()">hi</p>');
  assert.equal(review.changed, true);
  assert.ok(review.removed.some((note) => /script/i.test(note)));
  assert.ok(review.removed.some((note) => /event handler/i.test(note)));
});

test("clean markup reports nothing removed", () => {
  const review = reviewStudioHtml("<p>Just a sentence.</p>");
  assert.equal(review.changed, false);
  assert.deepEqual(review.removed, []);
});

test("emptiness is judged on what is left, not on the markup", () => {
  assert.equal(htmlHasContent("<p>words</p>"), true);
  assert.equal(htmlHasContent("<div><span>  </span></div>"), false);
  // An image is content even though it has no text.
  assert.equal(htmlHasContent('<img src="https://x.test/a.png" alt="">'), true);
  assert.equal(htmlHasContent("<script>alert(1)</script>"), false);
});

/* ── markdown is a way in too ──────────────────────────────── */

/**
 * `marked` passes raw HTML through untouched, by design. That was harmless
 * while the only way to fill a Markdown block was to type into one; importing
 * documents made it a route for someone else's markup to reach the public
 * page. <Prose> sanitises its output for exactly this reason, and these guard
 * the assumption it relies on.
 */
const rendered = (md: string) => sanitizeStudioHtml(marked.parse(md, { async: false }) as string);

test("markdown carrying a script renders nothing executable", () => {
  const html = rendered(["# Title", "", "<script>alert(1)</script>"].join("\n"));
  assert.doesNotMatch(html, /script|alert/i);
  assert.match(html, /Title/);
});

test("markdown carrying an inline handler renders nothing executable", () => {
  const html = rendered(["Text", "", '<img src=x onerror="alert(1)">'].join("\n"));
  assert.doesNotMatch(html, /onerror|alert/i);
});

test("ordinary markdown still renders as markup", () => {
  const html = rendered(
    ["## Heading", "", "Some **bold** text and a [link](https://x.test)."].join("\n")
  );
  assert.match(html, /<h2>Heading<\/h2>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /href="https:\/\/x\.test"/);
});
