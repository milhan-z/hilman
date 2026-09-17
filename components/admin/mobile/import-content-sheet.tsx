"use client";

import { useEffect, useState } from "react";
import { MobileSheet } from "../mobile-sheet";
import { templatesFor } from "@/lib/block-templates";
import {
  applyImport,
  describeCounts,
  outline,
  parseHtmlDocument,
  parseStudioJson,
  toBlocks,
  type HtmlImportMode,
  type ImportMode,
  type ImportSummary,
} from "@/lib/studio-import";
import { parseMarkdownDocument } from "@/lib/studio-import-markdown";
import { markdownStartersFor } from "@/lib/studio-import-starters";
import {
  HTML_MAPPING,
  HTML_REMOVED,
  LAYOUT_KEYS,
  MARKDOWN_MAPPING,
  aiPrompt,
  blockReference,
  jsonTemplate,
} from "@/lib/studio-import-reference";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/types";

/**
 * Starting from something other than an empty page.
 *
 * Everything here ends the same way: ordinary blocks, appended to the editor's
 * local state. Nothing in this sheet writes to the server, and nothing it
 * produces is published — a document that arrives saying it was published is
 * told, politely, that this is not something it gets to decide. See
 * lib/studio-import.ts.
 *
 * Three things were missing and are the reason this screen grew.
 *
 * It opened on an empty textarea, which answers "where do I paste" and not
 * "what should I paste". Starters answer the second question in the only form
 * that cannot be misread: real input, in the real format, that you edit rather
 * than interpret.
 *
 * Pasted HTML always became one opaque Custom HTML block. That is right for a
 * design and wrong for an article, so it is now a choice with the consequences
 * of each written next to it.
 *
 * And the preview counted blocks without showing them. Two documents with the
 * same tally can be entirely different documents; the thing worth checking
 * before pressing Add is whether the structure came through, so the preview is
 * an outline.
 *
 * The guides are generated from lib/studio-import-reference.ts, which the tests
 * run through the real parsers. Documentation maintained beside a parser is
 * documentation that goes stale, and this is the documentation someone reads
 * immediately before pasting a thousand lines.
 */

type Screen = "menu" | "markdown" | "html" | "json" | "guide";

const SOURCES: { id: "markdown" | "html" | "json"; label: string; detail: string }[] = [
  { id: "markdown", label: "Paste Markdown", detail: "From Notes, Obsidian, a chat" },
  { id: "html", label: "Paste HTML", detail: "Convert it, or keep it whole" },
  { id: "json", label: "Paste Studio JSON", detail: "The studio's own format" },
];

export interface ImportContentSheetProps {
  open: boolean;
  onClose: () => void;
  kind: "project" | "journal";
  /** What the editor currently holds — needed to offer Append vs Replace. */
  existing: Block[];
  onApply: (blocks: Block[], summary: ImportSummary) => void;
}

export function ImportContentSheet({
  open,
  onClose,
  kind,
  existing,
  onApply,
}: ImportContentSheetProps) {
  const [screen, setScreen] = useState<Screen>("menu");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");
  const [htmlMode, setHtmlMode] = useState<HtmlImportMode>("blocks");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) return;
    setScreen("menu");
    setText("");
    setError(null);
    setSummary(null);
    setMode("append");
    setHtmlMode("blocks");
    setCopied(false);
  }, [open]);

  const templates = templatesFor(kind);
  const starters = markdownStartersFor(kind);

  function useTemplate(templateId: string) {
    const template = templates.find((entry) => entry.id === templateId);
    if (!template) return;
    // The template modules build blocks directly; they only need ids and
    // positions, which toBlocks() assigns exactly as an import would.
    const built = toBlocks(
      template.build().map((block) => ({ type: block.type, data: block.data ?? {} }))
    );
    setSummary({
      title: null,
      blocks: built,
      counts: [],
      warnings: [],
      refused: [],
    });
  }

  function parse() {
    setError(null);
    const outcome =
      screen === "json"
        ? parseStudioJson(text, kind)
        : screen === "html"
          ? parseHtmlDocument(text, htmlMode)
          : parseMarkdownDocument(text);

    if (!outcome.ok) {
      // The editor is untouched. That is the point of parsing before applying.
      setError(outcome.error);
      return;
    }
    setSummary(outcome.summary);
  }

  async function copyPrompt() {
    try {
      await navigator.clipboard.writeText(aiPrompt(kind));
      setCopied(true);
    } catch {
      // Clipboard access can be refused, and a prompt you cannot copy is still
      // a prompt you can read: the text stays on screen either way.
      setCopied(false);
    }
  }

  /* ── the preview, and the decision ── */
  if (summary) {
    const counts = describeCounts(summary.counts);
    const { shown, hidden } = outline(summary.blocks);
    return (
      <MobileSheet
        open={open}
        onClose={onClose}
        title="Ready to add"
        subtitle={summary.title ?? undefined}
        actions={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSummary(null)}
              className="min-h-12 rounded-md border border-line-strong bg-surface text-sm font-semibold text-soft"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => {
                onApply(applyImport(existing, summary.blocks, mode), summary);
                onClose();
              }}
              className="min-h-12 rounded-md bg-hl text-sm font-semibold text-hl-ink"
            >
              Add to document
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div>
            <p className="text-sm font-semibold text-ink">
              {summary.blocks.length === 0
                ? "A title, and no blocks"
                : `${summary.blocks.length} ${summary.blocks.length === 1 ? "block" : "blocks"}`}
            </p>
            {counts.length > 0 && <p className="mt-1 text-sm text-soft">{counts.join(" · ")}</p>}
          </div>

          {/* ── the outline ──
              What arrived, in order, so the structure can be checked rather
              than assumed. */}
          {shown.length > 0 && (
            <div>
              <h3 className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
                What came through
              </h3>
              <ol className="space-y-1.5">
                {shown.map((row, index) => (
                  <li key={index} className="flex items-baseline gap-2.5 text-xs leading-relaxed">
                    <span className="w-16 shrink-0 font-mono text-2xs uppercase tracking-wide text-pen">
                      {row.type}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-soft">{row.detail || "—"}</span>
                  </li>
                ))}
              </ol>
              {hidden > 0 && (
                <p className="mt-2 text-xs text-faint">
                  …and {hidden} more, in the same order.
                </p>
              )}
            </div>
          )}

          {summary.warnings.length > 0 && (
            <div className="rounded-md border border-hl bg-hl-soft p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">Worth knowing</p>
              <ul className="mt-1.5 space-y-1">
                {summary.warnings.map((warning) => (
                  <li key={warning} className="text-xs leading-relaxed text-soft">
                    {warning}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {summary.refused.length > 0 && (
            <p className="rounded-md border border-line bg-raise p-3 text-xs leading-relaxed text-soft">
              This document also carried {summary.refused.join(", ")}. Studio ignored those —
              importing never changes what is published or which entry this is.
            </p>
          )}

          {existing.length > 0 && summary.blocks.length > 0 && (
            <fieldset>
              <legend className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
                How should this be added?
              </legend>
              <div className="space-y-2">
                {(
                  [
                    ["append", "Add after what's here", `Keeps your ${existing.length} existing blocks`],
                    ["replace", "Replace what's here", "Removes the blocks currently in the editor"],
                  ] as const
                ).map(([value, label, detail]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-center gap-3 rounded-md border px-3.5 transition-colors",
                      mode === value ? "border-hl bg-hl-soft" : "border-line bg-raise"
                    )}
                  >
                    <input
                      type="radio"
                      name="import-mode"
                      value={value}
                      checked={mode === value}
                      onChange={() => setMode(value)}
                      className="h-5 w-5 accent-[var(--pen)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{label}</span>
                      <span className="mt-0.5 block text-xs text-faint">{detail}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {mode === "replace" && existing.length > 0 && (
            <p role="status" className="rounded-md border border-line bg-raise p-3 text-xs leading-relaxed text-soft">
              This replaces your current working content. The public site will not change until you
              press Update live.
            </p>
          )}
        </div>
      </MobileSheet>
    );
  }

  /* ── the format guide ── */
  if (screen === "guide") {
    return (
      <MobileSheet
        open={open}
        onClose={onClose}
        title="What turns into what"
        subtitle="Generated from the importer itself"
        actions={
          <button
            type="button"
            onClick={() => setScreen("menu")}
            className="min-h-12 w-full rounded-md border border-line-strong bg-surface text-sm font-semibold text-soft"
          >
            Back
          </button>
        }
      >
        <div className="space-y-6">
          <section>
            <h3 className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
              Markdown
            </h3>
            <ul className="space-y-2.5">
              {MARKDOWN_MAPPING.map((row) => (
                <li key={row.syntax}>
                  <div className="flex items-baseline gap-2">
                    <code className="min-w-0 flex-1 whitespace-pre-wrap break-words rounded bg-raise px-1.5 py-0.5 font-mono text-2xs text-ink">
                      {row.syntax}
                    </code>
                    <span aria-hidden className="shrink-0 text-faint">
                      →
                    </span>
                    <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-pen">
                      {row.becomes}
                    </span>
                  </div>
                  {row.note && (
                    <p className="mt-1 text-xs leading-relaxed text-faint">{row.note}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
              HTML, when you convert it
            </h3>
            <ul className="space-y-2.5">
              {HTML_MAPPING.map((row) => (
                <li key={row.tag}>
                  <div className="flex items-baseline gap-2">
                    <code className="min-w-0 flex-1 font-mono text-2xs text-ink">{row.tag}</code>
                    <span aria-hidden className="shrink-0 text-faint">
                      →
                    </span>
                    <span className="shrink-0 font-mono text-2xs uppercase tracking-wide text-pen">
                      {row.becomes}
                    </span>
                  </div>
                  {row.note && (
                    <p className="mt-1 text-xs leading-relaxed text-faint">{row.note}</p>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3 rounded-md border border-line bg-raise p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-soft">
                Always removed
              </p>
              <ul className="mt-1.5 space-y-1">
                {HTML_REMOVED.map((line) => (
                  <li key={line} className="text-xs leading-relaxed text-soft">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
              Blocks, and the data each one takes
            </h3>
            <ul className="space-y-2">
              {blockReference().map((row) => (
                <li key={row.type}>
                  <p className="font-mono text-2xs uppercase tracking-wide text-pen">{row.type}</p>
                  <code className="mt-0.5 block whitespace-pre-wrap break-words font-mono text-2xs leading-relaxed text-soft">
                    {row.hint}
                  </code>
                  {row.note && (
                    <p className="mt-0.5 text-xs leading-relaxed text-faint">{row.note}</p>
                  )}
                </li>
              ))}
            </ul>
            <div className="mt-3">
              <p className="text-xs font-semibold text-ink">On any block</p>
              <ul className="mt-1 space-y-1">
                {LAYOUT_KEYS.map((row) => (
                  <li key={row.key} className="text-xs leading-relaxed text-soft">
                    <code className="font-mono text-2xs text-ink">{row.key}</code>: {row.values}
                    {row.note ? ` — ${row.note}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      </MobileSheet>
    );
  }

  /* ── pasting ── */
  if (screen !== "menu") {
    const entry = SOURCES.find((option) => option.id === screen)!;
    return (
      <MobileSheet
        open={open}
        onClose={onClose}
        title={entry.label}
        actions={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setScreen("menu")}
              className="min-h-12 rounded-md border border-line-strong bg-surface text-sm font-semibold text-soft"
            >
              Back
            </button>
            <button
              type="button"
              onClick={parse}
              disabled={!text.trim()}
              className="min-h-12 rounded-md bg-hl text-sm font-semibold text-hl-ink disabled:opacity-50"
            >
              Preview
            </button>
          </div>
        }
      >
        <div className="space-y-4">
          {/* ── HTML: convert, or keep whole ──
              Neither is the better answer in general, so neither is implied. */}
          {screen === "html" && (
            <fieldset>
              <legend className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
                What should happen to it?
              </legend>
              <div className="space-y-2">
                {(
                  [
                    [
                      "blocks",
                      "Convert to blocks",
                      "Headings, text and photos become editable blocks. Tables and anything else stay as markup.",
                    ],
                    [
                      "whole",
                      "Keep as one HTML block",
                      "Exactly what you pasted, classes and layout intact. Right for a design.",
                    ],
                  ] as const
                ).map(([value, label, detail]) => (
                  <label
                    key={value}
                    className={cn(
                      "flex min-h-14 cursor-pointer items-start gap-3 rounded-md border px-3.5 py-3 transition-colors",
                      htmlMode === value ? "border-hl bg-hl-soft" : "border-line bg-raise"
                    )}
                  >
                    <input
                      type="radio"
                      name="html-mode"
                      value={value}
                      checked={htmlMode === value}
                      onChange={() => setHtmlMode(value)}
                      className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--pen)]"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-ink">{label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-faint">
                        {detail}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}

          {/* ── Markdown: something to start from ── */}
          {screen === "markdown" && starters.length > 0 && !text.trim() && (
            <div>
              <p className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
                Or start from one of these
              </p>
              <div className="grid gap-2">
                {starters.map((starter) => (
                  <button
                    key={starter.id}
                    type="button"
                    onClick={() => setText(starter.body)}
                    className="min-h-14 rounded-md border border-line bg-raise p-3 text-left transition-colors hover:border-pen active:bg-card-hover"
                  >
                    <span className="block text-sm font-semibold text-ink">{starter.name}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-faint">
                      {starter.detail}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── JSON: an example, and a prompt for getting one written ── */}
          {screen === "json" && (
            <div className="space-y-2">
              {!text.trim() && (
                <button
                  type="button"
                  onClick={() => setText(jsonTemplate(kind))}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-line bg-raise px-3.5 text-left transition-colors hover:border-pen active:bg-card-hover"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">Fill with an example</span>
                    <span className="mt-0.5 block text-xs text-faint">
                      A valid {kind} document you can edit
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-faint">
                    ↓
                  </span>
                </button>
              )}
              <button
                type="button"
                onClick={() => void copyPrompt()}
                className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-line bg-raise px-3.5 text-left transition-colors hover:border-pen active:bg-card-hover"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-ink">
                    {copied ? "Prompt copied" : "Copy a prompt for an AI"}
                  </span>
                  <span className="mt-0.5 block text-xs text-faint">
                    {copied
                      ? "Paste it into a chat, then paste the reply back here"
                      : "Describes this exact format, including what it refuses"}
                  </span>
                </span>
                <span aria-hidden className="shrink-0 text-faint">
                  {copied ? "✓" : "⧉"}
                </span>
              </button>
            </div>
          )}

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={12}
            placeholder={
              screen === "json"
                ? '{\n  "version": 1,\n  "blocks": [ … ]\n}'
                : screen === "html"
                  ? "<section>\n  …\n</section>"
                  : "# Heading\n\nSome text…"
            }
            className="w-full overflow-x-auto whitespace-pre rounded-md border border-line bg-raise p-3 font-mono text-base leading-relaxed outline-none transition-colors focus:border-pen"
          />

          <div className="flex items-baseline justify-between gap-3">
            <p className="min-w-0 text-xs text-faint">
              {entry.detail}. Nothing is added until you confirm.
            </p>
            <button
              type="button"
              onClick={() => setScreen("guide")}
              className="shrink-0 text-xs text-soft underline decoration-line underline-offset-4"
            >
              Format guide
            </button>
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-red bg-red-soft px-3 py-2 text-sm text-red">
              {error}
            </p>
          )}
        </div>
      </MobileSheet>
    );
  }

  /* ── the menu ── */
  return (
    <MobileSheet open={open} onClose={onClose} title="Bring content in">
      <div className="space-y-5">
        {templates.length > 0 && (
          <section>
            <h3 className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">
              Templates
            </h3>
            <ul className="space-y-1.5">
              {templates.map((template) => (
                <li key={template.id}>
                  <button
                    type="button"
                    onClick={() => useTemplate(template.id)}
                    className="w-full rounded-md border border-line bg-raise p-3.5 text-left transition-colors hover:border-pen active:bg-card-hover"
                  >
                    <span className="block text-sm font-semibold text-ink">{template.name}</span>
                    <span className="mt-0.5 block text-xs leading-relaxed text-faint">
                      {template.description}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h3 className="mb-2 font-mono text-2xs uppercase tracking-widest text-faint">Import</h3>
          <ul className="space-y-1.5">
            {SOURCES.map((option) => (
              <li key={option.id}>
                <button
                  type="button"
                  onClick={() => setScreen(option.id)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-line bg-raise px-3.5 text-left transition-colors hover:border-pen active:bg-card-hover"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-faint">
                      {option.detail}
                    </span>
                  </span>
                  <span aria-hidden className="shrink-0 text-faint">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>

        <button
          type="button"
          onClick={() => setScreen("guide")}
          className="flex min-h-12 w-full items-center justify-between gap-3 text-left"
        >
          <span className="min-w-0 text-sm text-soft">What turns into what</span>
          <span
            aria-hidden
            className="shrink-0 text-xs text-soft underline decoration-line underline-offset-4"
          >
            Format guide
          </span>
        </button>
      </div>
    </MobileSheet>
  );
}
