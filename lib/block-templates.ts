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
 *
 * It lives in lib/ rather than beside the editor because it is pure data with
 * no React in it, and because lib/content-quality.ts reads it: the publication
 * gate that refuses to put unedited starter prompts on the public site derives
 * its list of prompts from these `build()` functions. It used to keep its own
 * hand-copied set, which meant adding a template here quietly created content
 * the gate could not recognise.
 *
 * "Blank" is in here too, rather than being a button wired straight to
 * insertBlock() beside the list. Two surfaces offer templates — the empty
 * document and the import sheet — and the one that had its own hardcoded Blank
 * was the one where the list could silently disagree with the registry. It is
 * marked `primary` so both surfaces can lead with it, because most of the time
 * "just start typing" is the right answer and a starter is the exception.
 */

export interface BlockTemplate {
  id: string;
  name: string;
  description: string;
  kind: "project" | "journal";
  /** Led with, and drawn as the recommended choice. At most one per kind. */
  emphasis?: "primary";
  build: () => Omit<Block, "id" | "position">[];
}

/**
 * A heading is structure, not an instruction.
 *
 * It carries no `starter` marker and its text is not a prompt: an author who
 * keeps "What I noticed" as a heading and writes underneath it has used the
 * template correctly. Marking these is what once made a finished Journal
 * unpublishable — see lib/starter-prompts.ts.
 */
const h = (level: 2 | 3, text: string) => ({ type: "heading" as BlockType, data: { level, text } });

/**
 * A paragraph from a template is a question waiting for an answer, so it says
 * so. `starter: true` is what lets the studio point at exactly these blocks,
 * offer to remove exactly these blocks, and leave them out of the reading time
 * until they are written in.
 */
const p = (text: string) => ({
  type: "paragraph" as BlockType,
  data: text ? { text, starter: true } : { text },
});

const rule = () => ({ type: "divider" as BlockType, data: { style: "line" } });

/** Marks any other block whose copy is a prompt rather than content. */
const prompt = <T extends { type: BlockType; data: Record<string, any> }>(block: T): T => ({
  ...block,
  data: { ...block.data, starter: true },
});

/** The prompts are written as instructions to the author, not as filler copy. */
const CONTEXT = "What was the situation, and what needed to change? One paragraph, no jargon.";
const ROLE =
  "What was your part? Name what you did yourself and what the rest of the team did — a reader can't tell otherwise.";
const OUTCOME =
  "What came out of it? If there are no numbers, describe the concrete result and what you'd do differently. Don't invent impact figures.";

export const BLOCK_TEMPLATES: BlockTemplate[] = [
  {
    id: "project-blank",
    name: "Blank",
    description: "One paragraph, and you start typing.",
    kind: "project",
    emphasis: "primary",
    build: () => [p("")],
  },
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
      prompt({
        type: "gallery",
        data: {
          layout: "grid",
          items: [
            { public_id: "", alt: "", caption: "What decision does this image show?" },
            { public_id: "", alt: "", caption: "" },
            { public_id: "", alt: "", caption: "" },
          ],
        },
      }),
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
      prompt({ type: "youtube", data: { youtube_id: "", caption: "The finished piece." } }),
      h(2, "How it was made"),
      p("Shooting conditions, the constraint you worked around, the choice you made in the edit."),
      prompt({
        type: "gallery",
        data: {
          layout: "columns",
          items: [
            { public_id: "", alt: "", caption: "Frame or still — say what it shows." },
            { public_id: "", alt: "", caption: "" },
          ],
        },
      }),
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
      prompt({ type: "image", data: { public_id: "", alt: "", caption: "A screenshot of the thing working." } }),
      h(2, "How it works"),
      p("The one design decision worth explaining — and what it cost."),
      prompt({ type: "code", data: { language: "ts", code: "// The smallest piece of code that shows the idea." } }),
      rule(),
      h(2, "Where it landed"),
      p(OUTCOME),
      prompt({ type: "link", data: { url: "", title: "Live demo or repository", description: "" } }),
    ],
  },
  {
    id: "journal-blank",
    name: "Blank",
    description: "One paragraph, and you start typing.",
    kind: "journal",
    emphasis: "primary",
    build: () => [p("")],
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
  {
    id: "journal-reflection",
    name: "Reflection",
    description: "A longer piece: the thing you keep returning to, argued out properly.",
    kind: "journal",
    build: () => [
      p("The thought, stated plainly enough that you could disagree with it."),
      h(2, "Where it came from"),
      p("The work, the conversation or the reading that put it there."),
      h(2, "What changes if it's true"),
      p("The consequence — for how you work, not in general."),
      prompt({
        type: "quote",
        data: { text: "Something you read that said it better.", source: "Who said it" },
      }),
      rule(),
      h(2, "What I'm still unsure about"),
      p("The part you have not resolved. Leaving it open is the honest ending."),
    ],
  },
];

/** This kind's templates, the recommended one first. */
export function templatesFor(kind: "project" | "journal") {
  return BLOCK_TEMPLATES.filter((t) => t.kind === kind).sort(
    (a, b) => Number(b.emphasis === "primary") - Number(a.emphasis === "primary")
  );
}
