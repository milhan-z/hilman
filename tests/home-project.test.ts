import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeProject } from "../components/home-project";
import type { Project } from "../lib/types";

// Deliberately synthetic layout fixtures, never installed as portfolio content.
const project = (extra: Partial<Project> = {}): Project => ({
  id: "layout-fixture", slug: "layout-fixture", title: "Layout fixture",
  subtitle: "A poster study", excerpt: "Testing a tall composition without cropping its words.",
  stream: "visual-design", thumbnail_public_id: "https://example.test/thumb.jpg",
  cover_public_id: "https://example.test/cover.jpg", year: 2026,
  status: "published", featured: true, sort_order: 0,
  meta: { role: "Layout and typography" }, published_at: null, ...extra,
});
const render = (p: Project) => renderToStaticMarkup(React.createElement(HomeProject, { project: p, index: 0 }));

test("Home proof contains the media, context and contribution before JavaScript", () => {
  const html = render(project());
  assert.match(html, /<article[^>]+aria-labelledby="home-project-layout-fixture"/);
  assert.match(html, /src="https:\/\/example.test\/cover.jpg"/);
  assert.match(html, /Testing a tall composition without cropping its words/);
  assert.match(html, /My contribution/);
  assert.match(html, /Layout and typography/);
  assert.match(html, /href="\/works\/layout-fixture"/);
  assert.doesNotMatch(html, /opacity-0|visibility:hidden/);
});

test("Home proof uses its real thumbnail when no deliverable cover exists", () => {
  const html = render(project({ cover_public_id: "pending:unresolved" }));
  assert.match(html, /src="https:\/\/example.test\/thumb.jpg"/);
  assert.doesNotMatch(html, /pending:/);
});

test("missing media and contribution do not produce a fabricated proof", () => {
  const html = render(project({ cover_public_id: null, thumbnail_public_id: null, meta: {} }));
  assert.doesNotMatch(html, /<img|My contribution|placeholder|Client|Outcome/);
  assert.match(html, /A poster study/);
});

test("a matching subtitle and excerpt is read once; author text is escaped", () => {
  const html = render(project({ subtitle: "<script>fixture</script>", excerpt: "<script>fixture</script>" }));
  assert.doesNotMatch(html, /<script>/);
  // One visible paragraph; the image alternative can repeat the description.
  assert.equal((html.match(/<p[^>]*>&lt;script&gt;fixture&lt;\/script&gt;<\/p>/g) ?? []).length, 1);
});
