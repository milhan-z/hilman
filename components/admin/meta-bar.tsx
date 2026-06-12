"use client";

import { useState } from "react";
import { CheckRow, Field, Select, TextArea, TextInput } from "./fields";
import { STREAMS } from "@/lib/types";
import type { JournalPost, Project, TagRow } from "@/lib/types";
import { slugify } from "@/lib/utils";
import { MediaField } from "./block-editors";

interface MetaBarProps {
  kind: "project" | "journal";
  initial: ((Project & JournalPost) | null);
  title: string;
  setTitle: (t: string) => void;
  slug: string;
  setSlug: (s: string) => void;
  subtitle: string;
  setSubtitle: (s: string) => void;
  stream: string;
  setStream: (s: string) => void;
  excerpt: string;
  setExcerpt: (s: string) => void;
  coverPublicId: string;
  setCoverPublicId: (s: string) => void;
  thumbnailPublicId: string;
  setThumbnailPublicId: (s: string) => void;
  year: string;
  setYear: (s: string) => void;
  sortOrder: string;
  setSortOrder: (s: string) => void;
  rawMeta: string;
  setRawMeta: (s: string) => void;
  readingMinutes: string;
  setReadingMinutes: (s: string) => void;
  status: "published" | "draft";
  setStatus: (s: "published" | "draft") => void;
  featured: boolean;
  setFeatured: (f: boolean) => void;
  tagIds: string[];
  setTagIds: React.Dispatch<React.SetStateAction<string[]>>;
  allTags: TagRow[];
}

export function MetaBar({
  kind,
  initial,
  title,
  setTitle,
  slug,
  setSlug,
  subtitle,
  setSubtitle,
  stream,
  setStream,
  excerpt,
  setExcerpt,
  coverPublicId,
  setCoverPublicId,
  thumbnailPublicId,
  setThumbnailPublicId,
  year,
  setYear,
  sortOrder,
  setSortOrder,
  rawMeta,
  setRawMeta,
  readingMinutes,
  setReadingMinutes,
  status,
  setStatus,
  featured,
  setFeatured,
  tagIds,
  setTagIds,
  allTags,
}: MetaBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const isProject = kind === "project";

  return (
    <div className="mb-6 overflow-hidden rounded-lg border border-line bg-surface shadow-card transition-all">
      {/* Meta Bar Header Toggle */}
      <div
        className="flex cursor-pointer items-center justify-between bg-raise px-5 py-3 hover:bg-card-hover select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold uppercase tracking-wider text-soft">
            Document Settings
          </span>
          <div className="flex items-center gap-2">
            <span className="rounded bg-pen-soft px-2 py-0.5 text-2xs font-medium uppercase text-pen">
              {kind}
            </span>
            {title && (
              <span className="hidden max-w-xs truncate text-xs text-faint sm:inline">
                · {title}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 text-xs text-faint">
          <span>{isOpen ? "Collapse settings" : "Expand settings"}</span>
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={`transition-transform duration-base ${isOpen ? "rotate-180" : ""}`}
          >
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </div>

      {/* Expanded Fields */}
      <div
        className={`grid gap-4 border-t border-line p-5 sm:grid-cols-2 ${
          isOpen ? "block animate-in fade-in duration-fast" : "hidden"
        }`}
      >
        <Field label="Title">
          <TextInput
            name="title"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>
        <Field label="Slug" hint="Leave empty to generate from title.">
          <TextInput
            name="slug"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            placeholder={slugify(title) || "auto"}
          />
        </Field>

        {isProject && (
          <Field label="Subtitle">
            <TextInput
              name="subtitle"
              value={subtitle}
              onChange={(e) => setSubtitle(e.target.value)}
            />
          </Field>
        )}
        {isProject && (
          <Field label="Stream">
            <Select
              name="stream"
              value={stream}
              onChange={(e) => setStream(e.target.value)}
            >
              {Object.entries(STREAMS).map(([key, s]) => (
                <option key={key} value={key}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="sm:col-span-2">
          <Field label="Excerpt" hint="Shown on cards and in search results.">
            <TextArea
              name="excerpt"
              rows={2}
              value={excerpt}
              onChange={(e) => setExcerpt(e.target.value)}
            />
          </Field>
        </div>

        <div>
          <MediaField
            label="Thumbnail Image"
            value={thumbnailPublicId}
            onChange={setThumbnailPublicId}
            onSelectAsset={(id) => setThumbnailPublicId(id)}
          />
          <input type="hidden" name="thumbnail_public_id" value={thumbnailPublicId} />
        </div>

        <div>
          <MediaField
            label="Cover Image"
            value={coverPublicId}
            onChange={setCoverPublicId}
            onSelectAsset={(id) => setCoverPublicId(id)}
          />
          <input type="hidden" name="cover_public_id" value={coverPublicId} />
        </div>

        {isProject ? (
          <>
            <Field label="Year">
              <TextInput
                name="year"
                type="number"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              />
            </Field>
            <Field label="Sort order" hint="Lower numbers appear first.">
              <TextInput
                name="sort_order"
                type="number"
                value={sortOrder}
                onChange={(e) => setSortOrder(e.target.value)}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field
                label="Meta (JSON)"
                hint='{ "role": "…", "tools": ["…"], "client": "…", "links": [{ "label": "…", "url": "…" }] }'
              >
                <TextArea
                  name="meta"
                  rows={4}
                  className="font-mono text-sm"
                  value={rawMeta}
                  onChange={(e) => setRawMeta(e.target.value)}
                />
              </Field>
            </div>
          </>
        ) : (
          <Field label="Reading minutes">
            <TextInput
              name="reading_minutes"
              type="number"
              value={readingMinutes}
              onChange={(e) => setReadingMinutes(e.target.value)}
            />
          </Field>
        )}

        {/* Tags Section */}
        <div className="sm:col-span-2 rounded border border-line bg-raise p-3.5">
          <h2 className="mb-2 text-xs font-semibold uppercase tracking-wider text-faint">Tags</h2>
          <div className="flex flex-wrap gap-x-5 gap-y-1">
            {allTags.map((t) => (
              <CheckRow
                key={t.id}
                label={t.name}
                checked={tagIds.includes(t.id)}
                onChange={(e) =>
                  setTagIds((prev) =>
                    e.target.checked ? [...prev, t.id] : prev.filter((id) => id !== t.id)
                  )
                }
              />
            ))}
            {allTags.length === 0 && (
              <p className="text-xs text-faint">No tags yet — create some under Taxonomy.</p>
            )}
          </div>
        </div>

        {/* Status Selection */}
        <div className="flex flex-wrap items-center gap-6 sm:col-span-2">
          <Field label="Status">
            <Select
              name="status"
              value={status}
              onChange={(e) => setStatus(e.target.value as "published" | "draft")}
            >
              <option value="draft">Draft</option>
              <option value="published">Published</option>
            </Select>
          </Field>
          <CheckRow
            name="featured"
            label="Featured (pinned with the highlighter)"
            checked={featured}
            onChange={(e) => setFeatured(e.target.checked)}
          />
        </div>
      </div>
    </div>
  );
}
