import type { Block, BlockType } from "@/lib/types";

/**
 * Starter layouts for a case study.
 *
 * These exist because "add a heading, a paragraph, an image" is not the hard
 * part of writing up a project — deciding what a reader needs, and in what
 * order, is. Each template is the same skeleton a visitor needs to follow:
 * context → your role → process and decisions → outcome → reflection.
 *
 * They are ordinary blocks with placeholder prompts in them. Nothing here is a
 * claim about the work: every line is a question for the author to replace, and
 * there are no invented metrics.
 */

export interface BlockTemplate {
  id: string;
  name: string;
  description: string;
  kind: "project" | "journal";
  build: () => Omit<Block, "id" | "position">[];
}

const h = (level: 2 | 3, text: string) => ({ type: "heading" as BlockType, data: { level, text } });
const p = (text: string) => ({ type: "paragraph" as BlockType, data: { text } });
const rule = () => ({ type: "divider" as BlockType, data: { style: "line" } });

/** The prompts are written as instructions to the author, not as filler copy. */
const CONTEXT = "What was the situation, and what needed to change? One paragraph, no jargon.";
const ROLE =
  "What was your part? Name what you did yourself and what the rest of the team did — a reader can't tell otherwise.";
const OUTCOME =
  "What came out of it? If there are no numbers, describe the concrete result and what you'd do differently. Don't invent impact figures.";

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  {
    id: "visual-design",
    name: "Visual design case study",
    description: "Context, role, decisions, a gallery of selected work, and a reflection.",
    kind: "project",
    build: () => [
      h(2, "The brief"),
      p(CONTEXT),
      h(2, "My role"),
      p(ROLE),
      h(2, "Decisions"),
      p("Two or three choices that shaped the result — and the constraint behind each one."),
      {
        type: "gallery",
        data: {
          layout: "grid",
          items: [
            { public_id: "", alt: "", caption: "What decision does this image show?" },
            { public_id: "", alt: "", caption: "" },
            { public_id: "", alt: "", caption: "" },
          ],
        },
      },
      rule(),
      h(2, "Where it landed"),
      p(OUTCOME),
    ],
  },
  {
    id: "visual-story",
    name: "Story / video case study",
    description: "Subject, your role on set and in the edit, the film itself, and stills.",
    kind: "project",
    build: () => [
      h(2, "The story"),
      p("Who or what is this about, and why did it deserve filming?"),
      h(2, "My role"),
      p(ROLE),
      { type: "youtube", data: { youtube_id: "", caption: "The finished piece." } },
      h(2, "How it was made"),
      p("Shooting conditions, the constraint you worked around, the choice you made in the edit."),
      {
        type: "gallery",
        data: {
          layout: "columns",
          items: [
            { public_id: "", alt: "", caption: "Frame or still — say what it shows." },
            { public_id: "", alt: "", caption: "" },
          ],
        },
      },
      rule(),
      h(2, "What it did"),
      p(OUTCOME),
    ],
  },
  {
    id: "digital-lab",
    name: "Code project case study",
    description: "Problem, what you built, how it works, a look at the code, and links.",
    kind: "project",
    build: () => [
      h(2, "The problem"),
      p(CONTEXT),
      h(2, "What I built"),
      p("One paragraph a non-engineer can follow. Save the stack list for below."),
      { type: "image", data: { public_id: "", alt: "", caption: "A screenshot of the thing working." } },
      h(2, "How it works"),
      p("The one design decision worth explaining — and what it cost."),
      { type: "code", data: { language: "ts", code: "// The smallest piece of code that shows the idea." } },
      rule(),
      h(2, "Where it landed"),
      p(OUTCOME),
      { type: "link", data: { url: "", title: "Live demo or repository", description: "" } },
    ],
  },
  {
    id: "journal-note",
    name: "Working note",
    description: "A short entry: what happened, what you noticed, what you'd try next.",
    kind: "journal",
    build: () => [
      p("What prompted this note?"),
      h(3, "What I noticed"),
      p("The observation, while it is still specific."),
      h(3, "What I'd try next"),
      p("The next experiment, so future you has a starting point."),
    ],
  },
];

export function templatesFor(kind: "project" | "journal") {
  return BLOCK_TEMPLATES.filter((t) => t.kind === kind);
}
