/**
 * Something to paste, for someone who has nothing to paste yet.
 *
 * The import screen used to open on an empty textarea, which answers the
 * question "where do I put my content" and not the one people actually have:
 * *what should it look like so it comes out clean?* A starter is the answer in
 * the only form that cannot be misread — real input, in the real format, that
 * you can edit rather than interpret.
 *
 * They are strings on purpose. A Markdown starter has to survive being pasted
 * into a note, a chat or a text editor and come back; anything cleverer than
 * text would stop round-tripping the moment it left the app.
 *
 * One registry, so the same starter cannot drift between the sheet that offers
 * it, the guide that documents it and any test that checks it.
 */

export type StarterKind = "project" | "journal";

export interface ImportStarter {
  id: string;
  name: string;
  /** One line, shown under the name on the tile. */
  detail: string;
  /** Which document kinds it makes sense for. Empty means both. */
  kinds?: StarterKind[];
  body: string;
}

/* ── Markdown ─────────────────────────────────────────────── */

const PROJECT_CASE_STUDY = `# Project Title

A short introduction about the project.

## Overview

Explain what the project is.

## Problem

What problem were you trying to solve?

## Process

Describe how you approached the project.

> Add a key insight or quote here.

## Result

Explain the result.

---

## Tech Stack

- Next.js
- Supabase
- Figma

## Reflection

What did you learn?
`;

const ARTICLE = `# Article Title

Short introduction.

## Context

Write the context here.

## Main idea

Write the main section here.

> Optional quote.

## Conclusion

Final thoughts.
`;

const NOTES = `# Note title

What prompted this note?

## What I noticed

Write the observation.

## What I learned

Write the takeaway.

## Next

What should happen next?
`;

export const MARKDOWN_STARTERS: ImportStarter[] = [
  {
    id: "article",
    name: "Article",
    detail: "Intro, context, idea, conclusion",
    body: ARTICLE,
  },
  {
    id: "case-study",
    name: "Project case study",
    detail: "Overview, problem, process, result",
    kinds: ["project"],
    body: PROJECT_CASE_STUDY,
  },
  {
    id: "notes",
    name: "Notes",
    detail: "Noticed, learned, next",
    kinds: ["journal"],
    body: NOTES,
  },
];

/** The starters that make sense for the document being edited. */
export function markdownStartersFor(kind: StarterKind): ImportStarter[] {
  return MARKDOWN_STARTERS.filter((starter) => !starter.kinds || starter.kinds.includes(kind));
}
