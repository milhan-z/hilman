"use client";

import { useEffect, useState } from "react";
import { MobileSheet } from "../mobile-sheet";
import { templatesFor } from "../block-templates";
import {
  applyImport,
  describeCounts,
  parseHtmlDocument,
  parseStudioJson,
  toBlocks,
  type ImportMode,
  type ImportSummary,
} from "@/lib/studio-import";
import { parseMarkdownDocument } from "@/lib/studio-import-markdown";
import { cn } from "@/lib/utils";
import type { Block } from "@/lib/types";

/**
 * Starting from something other than an empty page.
 *
 * Templates already existed but were only offered when a document had no
 * blocks at all, which meant the one time you could reach them was the one
 * time you might not know you wanted them. They are a first-class way of
 * adding content now, alongside pasting a document in.
 *
 * Everything here ends the same way: ordinary blocks, appended to the editor's
 * local state. Nothing in this sheet writes to the server, and nothing it
 * produces is published — a document that arrives saying it was published is
 * told, politely, that this is not something it gets to decide. See
 * lib/studio-import.ts.
 *
 * The step that matters is the preview. Pasting a thousand lines of JSON and
 * having the editor change underneath you is not a workflow anyone can trust;
 * you see what was understood, what was dropped, and where it will go, and
 * then you decide.
 */

type Source = "menu" | "markdown" | "html" | "json";

const SOURCES: { id: Exclude<Source, "menu">; label: string; detail: string }[] = [
  { id: "markdown", label: "Paste Markdown", detail: "From Notes, Obsidian, a chat" },
  { id: "html", label: "Paste HTML", detail: "Kept whole as one Custom HTML block" },
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
  const [source, setSource] = useState<Source>("menu");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const [mode, setMode] = useState<ImportMode>("append");

  useEffect(() => {
    if (!open) return;
    setSource("menu");
    setText("");
    setError(null);
    setSummary(null);
    setMode("append");
  }, [open]);

  const templates = templatesFor(kind);

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
      source === "json"
        ? parseStudioJson(text, kind)
        : source === "html"
          ? parseHtmlDocument(text)
          : parseMarkdownDocument(text);

    if (!outcome.ok) {
      // The editor is untouched. That is the point of parsing before applying.
      setError(outcome.error);
      return;
    }
    setSummary(outcome.summary);
  }

  /* ── the preview, and the decision ── */
  if (summary) {
    const counts = describeCounts(summary.counts);
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
              {summary.blocks.length} {summary.blocks.length === 1 ? "block" : "blocks"}
            </p>
            {counts.length > 0 && (
              <p className="mt-1 text-sm text-soft">{counts.join(" · ")}</p>
            )}
          </div>

          {summary.warnings.length > 0 && (
            <div className="rounded-md border border-hl/50 bg-hl-soft/15 p-3">
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

          {existing.length > 0 && (
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
                      mode === value ? "border-hl bg-hl-soft/20" : "border-line bg-raise"
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

  /* ── pasting ── */
  if (source !== "menu") {
    const entry = SOURCES.find((option) => option.id === source)!;
    return (
      <MobileSheet
        open={open}
        onClose={onClose}
        title={entry.label}
        actions={
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSource("menu")}
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
        <div className="space-y-3">
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            rows={12}
            placeholder={
              source === "json"
                ? '{\n  "version": 1,\n  "blocks": [ … ]\n}'
                : source === "html"
                  ? "<section>\n  …\n</section>"
                  : "# Heading\n\nSome text…"
            }
            className="w-full overflow-x-auto whitespace-pre rounded-md border border-line bg-raise p-3 font-mono text-base leading-relaxed outline-none transition-colors focus:border-pen"
          />
          <p className="text-xs text-faint">{entry.detail}. Nothing is added until you confirm.</p>
          {error && (
            <p role="alert" className="rounded-md border border-red/40 bg-red-soft/20 px-3 py-2 text-sm text-red">
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
                  onClick={() => setSource(option.id)}
                  className="flex min-h-12 w-full items-center justify-between gap-3 rounded-md border border-line bg-raise px-3.5 text-left transition-colors hover:border-pen active:bg-card-hover"
                >
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-ink">{option.label}</span>
                    <span className="mt-0.5 block truncate text-xs text-faint">{option.detail}</span>
                  </span>
                  <span aria-hidden className="shrink-0 text-faint">
                    ›
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </MobileSheet>
  );
}
