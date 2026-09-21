"use client";

import { useState } from "react";
import { PublicationDateField } from "../publication-date-field";
import { readTimeLabel, readTimeMinutes } from "@/lib/read-time";
import { MobileSheet } from "../mobile-sheet";
import { CheckRow, Field, Select, TextArea, TextInput } from "../fields";
import { MediaField } from "../block-editors";
import { PublishBadge } from "./status-line";
import type { EditorDoc, EditorPatch } from "../editor-doc";
import { STREAMS, type Stream } from "@/lib/types";
import type { TagRow } from "@/lib/types";
import { slugify } from "@/lib/utils";

/**
 * Everything about a piece of work that isn't the work.
 *
 * All of this used to sit above the writing in a panel called "Document
 * Settings" — so the first thing you saw when you opened a half-finished
 * paragraph on your phone was a slug field. It lives behind one tappable
 * summary line now. The fields are the same fields; only their turn to be
 * looked at has changed.
 *
 * Status is shown and not offered. The bottom bar publishes.
 */

export interface MetadataSheetProps {
  open: boolean;
  onClose: () => void;
  kind: "project" | "journal";
  doc: EditorDoc;
  patch: EditorPatch;
  allTags: TagRow[];
  /** What the public site currently serves — not what the form holds. */
  published: boolean;
}

/** The line in the editor that opens the sheet. */
export function MetadataSummary({
  kind,
  doc,
  published,
  onOpen,
}: {
  kind: "project" | "journal";
  doc: EditorDoc;
  published: boolean;
  onOpen: () => void;
}) {
  const bits = [
    published ? "Live" : "Draft",
    kind === "project" ? STREAMS[doc.stream as Stream]?.name ?? doc.stream : null,
    kind === "project"
      ? doc.year || null
      : readTimeLabel(readTimeMinutes({ excerpt: doc.excerpt, blocks: doc.blocks })),
    doc.tagIds.length > 0 ? `${doc.tagIds.length} tag${doc.tagIds.length === 1 ? "" : "s"}` : null,
  ].filter(Boolean) as string[];

  /* A byline, not a settings row.
     This was a bordered card above the writing, which put a control at the top
     of a screen whose whole job is to look like a page. It says the same things
     in the same order; it just stops announcing itself. Still a full-width
     44px target, because it is still the way into the Details sheet. */
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group/meta flex min-h-11 w-full items-center justify-between gap-3 text-left"
    >
      <span className="min-w-0 truncate text-xs text-faint">{bits.join(" · ")}</span>
      <span
        aria-hidden
        className="shrink-0 text-xs text-soft underline decoration-line underline-offset-4 transition-colors group-active/meta:text-pen"
      >
        Details
      </span>
    </button>
  );
}

export function MetadataSheet({
  open,
  onClose,
  kind,
  doc,
  patch,
  allTags,
  published,
}: MetadataSheetProps) {
  const [advanced, setAdvanced] = useState(false);
  const isProject = kind === "project";

  return (
    <MobileSheet open={open} onClose={onClose} title="Details" subtitle={doc.title || undefined}>
      <div className="space-y-4">
        {/* Read-only on purpose — see the file comment. */}
        <div className="flex items-center justify-between gap-3 rounded-md border border-line bg-raise px-3.5 py-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">On the public site</p>
            <p className="mt-0.5 text-xs text-soft">
              {published
                ? "Anyone can read this."
                : "Only you can see this. Publish from the bar at the bottom."}
            </p>
          </div>
          <PublishBadge label={published ? "Live" : "Draft"} />
        </div>

        <Field label="Short description" hint="Shown on cards and in search results.">
          <TextArea
            rows={2}
            value={doc.excerpt}
            onChange={(event) => patch({ excerpt: event.target.value })}
          />
        </Field>

        {isProject && (
          <>
            <Field label="Subtitle">
              <TextInput
                value={doc.subtitle}
                onChange={(event) => patch({ subtitle: event.target.value })}
              />
            </Field>
            <Field label="Stream">
              <Select value={doc.stream} onChange={(event) => patch({ stream: event.target.value })}>
                {Object.entries(STREAMS).map(([key, stream]) => (
                  <option key={key} value={key}>
                    {stream.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Year">
              <TextInput
                type="number"
                inputMode="numeric"
                value={doc.year}
                onChange={(event) => patch({ year: event.target.value })}
              />
            </Field>
          </>
        )}

        {!isProject && (
          /* Shown, not asked for. It moves as you type, with no request and
             nothing to keep up to date. */
          <Field label="Reading time">
            <p className="text-sm text-ink">
              {readTimeLabel(readTimeMinutes({ excerpt: doc.excerpt, blocks: doc.blocks }))}
            </p>
            <p className="mt-0.5 text-xs text-faint">Calculated from your story.</p>
          </Field>
        )}

        <div>
          <MediaField
            label={isProject ? "Cover image" : "Header image"}
            value={doc.coverPublicId}
            onChange={(value) => patch({ coverPublicId: value })}
            onSelectAsset={(id) => patch({ coverPublicId: id })}
          />
        </div>

        {isProject && (
          <div>
            <MediaField
              label="Thumbnail"
              value={doc.thumbnailPublicId}
              onChange={(value) => patch({ thumbnailPublicId: value })}
              onSelectAsset={(id) => patch({ thumbnailPublicId: id })}
            />
          </div>
        )}

        <fieldset className="rounded-md border border-line bg-raise p-3.5">
          <legend className="px-1 font-mono text-2xs uppercase tracking-widest text-faint">
            Tags
          </legend>
          <div className="flex flex-wrap gap-x-5">
            {allTags.map((tag) => (
              <CheckRow
                key={tag.id}
                label={tag.name}
                checked={doc.tagIds.includes(tag.id)}
                onChange={(event) =>
                  patch({
                    tagIds: event.target.checked
                      ? [...doc.tagIds, tag.id]
                      : doc.tagIds.filter((id) => id !== tag.id),
                  })
                }
              />
            ))}
            {allTags.length === 0 && (
              <p className="py-2 text-xs text-faint">No tags yet — add some under Taxonomy.</p>
            )}
          </div>
        </fieldset>

        <div className="rounded-md border border-line bg-raise px-3.5">
          <CheckRow
            label="Pin this to the front"
            checked={doc.featured}
            onChange={(event) => patch({ featured: event.target.checked })}
          />
        </div>

        {/* The date the piece belongs to, which is not always the date it was
            uploaded. Left empty, the database keeps doing what it did: stamp
            the moment of first publish and never move it. Filled in, this
            wins — for something written last month, a date corrected after
            the fact, or an entry backdated to when the thing happened. */}
        <PublicationDateField doc={doc} patch={patch} />

        <button
          type="button"
          onClick={() => setAdvanced((open) => !open)}
          aria-expanded={advanced}
          className="flex min-h-12 w-full items-center justify-between rounded-md border border-line px-3.5 text-sm font-medium text-soft transition-colors hover:text-ink"
        >
          Advanced
          <span aria-hidden className={advanced ? "rotate-180" : undefined}>
            ⌄
          </span>
        </button>

        {advanced && (
          <div className="space-y-4">
            <Field label="Address on the site" hint="Left empty, it follows the title.">
              <TextInput
                value={doc.slug}
                onChange={(event) => patch({ slug: event.target.value })}
                placeholder={slugify(doc.title) || "auto"}
              />
            </Field>

            {isProject && (
              <>
                <Field label="Sort order" hint="Lower numbers appear first.">
                  <TextInput
                    type="number"
                    inputMode="numeric"
                    value={doc.sortOrder}
                    onChange={(event) => patch({ sortOrder: event.target.value })}
                  />
                </Field>
                <Field
                  label="Extra details (JSON)"
                  hint='{ "role": "…", "tools": ["…"], "client": "…" }'
                >
                  <TextArea
                    rows={5}
                    className="font-mono text-sm"
                    value={doc.rawMeta}
                    onChange={(event) => patch({ rawMeta: event.target.value })}
                  />
                </Field>
              </>
            )}
          </div>
        )}
      </div>
    </MobileSheet>
  );
}
