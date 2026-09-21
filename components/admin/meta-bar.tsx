"use client";

import { useState } from "react";
import { PublicationDateField } from "./publication-date-field";
import { readTimeLabel, readTimeMinutes } from "@/lib/read-time";
import { CheckRow, Field, Select, TextArea, TextInput } from "./fields";
import { MediaField } from "./block-editors";
import { PublishBadge } from "./mobile/status-line";
import type { EditorDoc, EditorPatch } from "./editor-doc";
import { STREAMS } from "@/lib/types";
import type { TagRow } from "@/lib/types";
import { slugify } from "@/lib/utils";

/**
 * The desktop settings panel.
 *
 * Same fields as before and still collapsed by default, but two things have
 * changed. It takes the document rather than forty individual props. And the
 * Status dropdown is gone: it sat in the middle of a form, three sections
 * above the Save button, and flipping it turned an ordinary save into a
 * publish — which is the single largest source of "wait, is that live now?".
 * Publishing is the save bar's job on every screen size.
 *
 * On a phone this is replaced entirely by <MetadataSheet />.
 */

export interface MetaBarProps {
  kind: "project" | "journal";
  doc: EditorDoc;
  patch: EditorPatch;
  allTags: TagRow[];
  /** What the public site serves right now. Shown, not editable. */
  published: boolean;
}

export function MetaBar({ kind, doc, patch, allTags, published }: MetaBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isProject = kind === "project";

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-line bg-surface shadow-card">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="flex min-h-12 w-full items-center justify-between gap-3 bg-raise px-5 py-3 text-left hover:bg-card-hover"
      >
        <span className="flex items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-wider text-soft">Details</span>
          <PublishBadge label={published ? "Live" : "Draft"} />
          {doc.title && (
            <span className="hidden max-w-xs truncate text-xs text-faint sm:inline">· {doc.title}</span>
          )}
        </span>
        <span className="flex items-center gap-2 text-xs text-faint">
          {isOpen ? "Collapse" : "Expand"}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={isOpen ? "rotate-180 transition-transform" : "transition-transform"}
            aria-hidden
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        </span>
      </button>

      {isOpen && (
        <div className="grid gap-4 border-t border-line p-5 sm:grid-cols-2">
          <Field label="Title">
            <TextInput
              required
              value={doc.title}
              onChange={(event) => patch({ title: event.target.value })}
            />
          </Field>
          <Field label="Slug" hint="Leave empty to generate from the title.">
            <TextInput
              value={doc.slug}
              onChange={(event) => patch({ slug: event.target.value })}
              placeholder={slugify(doc.title) || "auto"}
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
                <Select
                  value={doc.stream}
                  onChange={(event) => patch({ stream: event.target.value })}
                >
                  {Object.entries(STREAMS).map(([key, stream]) => (
                    <option key={key} value={key}>
                      {stream.name}
                    </option>
                  ))}
                </Select>
              </Field>
            </>
          )}

          <div className="sm:col-span-2">
            <Field label="Excerpt" hint="Shown on cards and in search results.">
              <TextArea
                rows={2}
                value={doc.excerpt}
                onChange={(event) => patch({ excerpt: event.target.value })}
              />
            </Field>
          </div>

          {isProject && (
            <div>
              <MediaField
                label="Thumbnail image"
                value={doc.thumbnailPublicId}
                onChange={(value) => patch({ thumbnailPublicId: value })}
                onSelectAsset={(id) => patch({ thumbnailPublicId: id })}
              />
            </div>
          )}

          <div>
            <MediaField
              label="Cover image"
              value={doc.coverPublicId}
              onChange={(value) => patch({ coverPublicId: value })}
              onSelectAsset={(id) => patch({ coverPublicId: id })}
            />
          </div>

          {isProject ? (
            <>
              <Field label="Year">
                <TextInput
                  type="number"
                  value={doc.year}
                  onChange={(event) => patch({ year: event.target.value })}
                />
              </Field>
              <Field label="Sort order" hint="Lower numbers appear first.">
                <TextInput
                  type="number"
                  value={doc.sortOrder}
                  onChange={(event) => patch({ sortOrder: event.target.value })}
                />
              </Field>
              <div className="sm:col-span-2">
                <Field
                  label="Meta (JSON)"
                  hint='{ "role": "…", "tools": ["…"], "client": "…", "links": [{ "label": "…", "url": "…" }] }'
                >
                  <TextArea
                    rows={4}
                    className="font-mono text-sm"
                    value={doc.rawMeta}
                    onChange={(event) => patch({ rawMeta: event.target.value })}
                  />
                </Field>
              </div>
            </>
          ) : (
            /* Read-only: the words decide this, not the author. */
            <Field label="Reading time">
              <p className="text-sm text-ink">
                {readTimeLabel(readTimeMinutes({ excerpt: doc.excerpt, blocks: doc.blocks }))}
              </p>
              <p className="mt-0.5 text-xs text-faint">Calculated from your story.</p>
            </Field>
          )}

          {/* Publishing is the action bar's decision; *when* it says it was
              published is an editorial fact, and one the desktop had no way to
              state. Same component as the phone's metadata sheet — one place
              knows what an untouched field means. */}
          <div className="sm:col-span-2">
            <PublicationDateField doc={doc} patch={patch} />
          </div>

          <fieldset className="rounded border border-line bg-raise p-3.5 sm:col-span-2">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wider text-faint">
              Tags
            </legend>
            <div className="flex flex-wrap gap-x-5 gap-y-1">
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
                <p className="text-xs text-faint">No tags yet — create some under Taxonomy.</p>
              )}
            </div>
          </fieldset>

          <div className="sm:col-span-2">
            <CheckRow
              label="Featured (pinned with the highlighter)"
              checked={doc.featured}
              onChange={(event) => patch({ featured: event.target.checked })}
            />
          </div>
        </div>
      )}
    </div>
  );
}
