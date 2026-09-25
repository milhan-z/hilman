"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Field, Select, TextArea, TextInput } from "./fields";
import { MediaCapture } from "./media-capture";
import { PendingPhoto } from "./pending-media";
import { isPendingRef } from "@/lib/studio-media-refs";
import { discardPendingMedia } from "@/lib/studio-local/media";
import { useMediaSelector } from "./media-library-context";
import { mediaSrc } from "@/lib/cloudinary";
import { DeferredLoading, DeferredUnavailable, useLoadedOr } from "./deferred";
import { LoopClipField } from "./loop-clip-field";
import { normalizeBlockLayout, resolveSpacing, resolveSpan } from "@/lib/block-layout";
import { LayoutPicker } from "./layout-picker";
import { LinkBlockEditor } from "./link-block-editor";
import { hasLayoutChoices } from "@/lib/media-layouts";
import type { BlockType } from "@/lib/types";

/* ─────────────────────────────────────────────────────────
   Block engine editor side: map type → form.
   Adding a block type = one entry in DEFAULT_DATA + EDITORS
   (+ one renderer in components/blocks/renderer.tsx).
   ───────────────────────────────────────────────────────── */

export const BLOCK_TYPES: { type: BlockType; label: string }[] = [
  { type: "heading", label: "Heading" },
  { type: "paragraph", label: "Paragraph" },
  { type: "markdown", label: "Markdown" },
  { type: "image", label: "Image" },
  { type: "gallery", label: "Gallery" },
  { type: "youtube", label: "YouTube" },
  { type: "loop-clip", label: "Loop Clip" },
  { type: "embed", label: "Embed" },
  { type: "quote", label: "Quote" },
  { type: "divider", label: "Divider" },
  { type: "code", label: "Code" },
  { type: "button", label: "Button" },
  { type: "link", label: "Link card" },
  { type: "file", label: "File" },
  { type: "html", label: "Custom HTML" },
  { type: "custom", label: "Custom (experiment)" },
];

export const DEFAULT_DATA: Record<BlockType, Record<string, any>> = {
  heading: { level: 2, text: "" },
  paragraph: { text: "" },
  markdown: { md: "" },
  image: { public_id: "", alt: "", caption: "" },
  gallery: { layout: "grid", items: [] },
  youtube: { youtube_id: "", caption: "" },
  "loop-clip": { src: "", caption: "", fit: "cover" },
  embed: { url: "", provider: "" },
  quote: { text: "", source: "" },
  divider: { style: "line" },
  code: { language: "ts", code: "" },
  button: { label: "", href: "", variant: "pen" },
  link: { url: "", title: "", description: "" },
  file: { public_id: "", filename: "" },
  html: { html: "" },
  custom: { component: "ink-field", props: {} },
};

/** One-line summary shown on a collapsed block row. */
export function blockSummary(type: BlockType, data: Record<string, any>): string {
  switch (type) {
    case "heading": return data.text || "(empty heading)";
    case "paragraph": return (data.text || "").slice(0, 80) || "(empty paragraph)";
    case "markdown": return (data.md || "").slice(0, 80) || "(empty markdown)";
    case "image": return data.public_id || data.src || "(no image)";
    case "gallery": return `${(data.items ?? []).length} item(s)`;
    case "youtube": return data.youtube_id || "(no video id)";
    case "loop-clip": return isPendingRef(data.src) ? "Uploading…" : data.caption || data.src || "(no clip)";
    case "embed": return data.url || "(no url)";
    case "quote": return (data.text || "").slice(0, 80) || "(empty quote)";
    case "divider": return data.style ?? "line";
    case "code": return `${data.language ?? ""} · ${(data.code || "").slice(0, 50)}`;
    case "button": return data.label || "(no label)";
    case "link": return data.title || data.url || "(no link)";
    case "file": return data.filename || "(no file)";
    case "html": {
      const text = String(data.html ?? "").trim();
      return text ? `${text.slice(0, 60)}${text.length > 60 ? "…" : ""}` : "(empty HTML)";
    }
    case "custom": return data.component || "(no component)";
  }
}

interface EditorProps {
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
}

/**
 * The Custom HTML editor, fetched the first time a Custom HTML block's
 * settings are opened.
 *
 * It reviews pasted markup with lib/studio-html.ts, and that brings
 * sanitize-html, postcss and htmlparser2 with it — weight every other block's
 * settings, and the editor's first paint, would otherwise carry for the one
 * block type that uses it. It only ever renders inside an open settings sheet,
 * which the server never draws, hence `ssr: false`.
 */
type HtmlEditor = typeof import("./html-block-editor").HtmlBlockEditor;

let loadedHtmlEditor: HtmlEditor | null = null;

const rememberHtmlEditor = (module: typeof import("./html-block-editor")) =>
  (loadedHtmlEditor = module.HtmlBlockEditor);

const LazyHtmlBlockEditor = dynamic(
  () => import("./html-block-editor").then(rememberHtmlEditor, () => DeferredUnavailable),
  { ssr: false, loading: () => <DeferredLoading what="the HTML editor" /> }
);

/** Fetches the Custom HTML editor ahead of need. See warmEditor() in live-editor.tsx. */
export function prefetchHtmlBlockEditor(): Promise<unknown> {
  return import("./html-block-editor").then(rememberHtmlEditor);
}

function HtmlBlockEditor(props: React.ComponentProps<HtmlEditor>) {
  const Editor = useLoadedOr(loadedHtmlEditor, LazyHtmlBlockEditor);
  return <Editor {...props} />;
}

export function MediaField({
  label,
  value,
  onChange,
  onSelectAsset,
  accept = "image/*",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onSelectAsset?: (publicId: string, altText?: string) => void;
  accept?: string;
}) {
  // MediaCapture owns its own "keeping…" state; this is only for errors that
  // come from the library picker.
  const [error, setError] = useState<string | null>(null);
  
  // Safe invocation of media selector context
  let mediaSelector: any = null;
  try {
    mediaSelector = useMediaSelector();
  } catch {
    // Context is not available (e.g. in standalone field rendering)
  }

  function handleChooseFromLibrary() {
    if (mediaSelector) {
      mediaSelector.openSelector((publicId: string, altText?: string) => {
        if (onSelectAsset) {
          onSelectAsset(publicId, altText);
        } else {
          onChange(publicId);
        }
      });
    }
  }

  const pending = isPendingRef(value);

  return (
    <Field label={label}>
      <div className="space-y-2">
        {/* What you actually chose, as a picture. A field whose only feedback
            is a string of folder/asset-id tells you nothing about whether it
            is the right photo. */}
        {value && !pending && (
          <MediaPreview value={value} onClear={() => onChange("")} />
        )}

        {/* The camera first: on a phone the photo usually does not exist yet. */}
        <MediaCapture
          accept={accept}
          onCaptured={(ref) => {
            setError(null);
            if (onSelectAsset) onSelectAsset(ref);
            else onChange(ref);
          }}
        />

        {pending && (
          <PendingPhoto
            photoRef={value}
            onDiscard={() => {
              void discardPendingMedia(value);
              onChange("");
            }}
          />
        )}

        {mediaSelector && (
          <button
            type="button"
            onClick={handleChooseFromLibrary}
            className="min-h-12 w-full rounded-md border border-line bg-raise px-3.5 text-sm font-medium text-soft transition-colors hover:border-pen hover:text-pen"
          >
            {value && !pending ? "Choose a different photo" : "Choose from your photos"}
          </button>
        )}

        {/* The storage id, for the one case that needs it: pasting a reference
            from somewhere else. Hidden on a phone — "folder/asset-id" is how
            Cloudinary files a picture, not something anyone should have to
            type to add one, and every route above produces it for you. */}
        <details className="hidden lg:block">
          <summary className="cursor-pointer text-xs text-faint">Paste a reference instead</summary>
          <div className="mt-2">
            <TextInput
              value={pending ? "" : value}
              onChange={(e) => onChange(e.target.value)}
              placeholder={pending ? "Waiting for the photo above" : "folder/asset-id or https://…"}
              disabled={pending}
            />
          </div>
        </details>
      </div>
      {error && <span className="mt-1 block text-xs text-red">{error}</span>}
    </Field>
  );
}

/** A chosen photo, shown rather than named. */
function MediaPreview({ value, onClear }: { value: string; onClear: () => void }) {
  const src = mediaSrc(value, { width: 320 });
  if (!src) return null;
  return (
    <figure className="overflow-hidden rounded-md border border-line bg-raise">
      {/* A CDN thumbnail at a fixed width — next/image would put a second
          resizing layer in front of a URL that is already the right size. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="block max-h-48 w-full object-cover" />
      <figcaption className="flex justify-end px-2 py-1">
        <button
          type="button"
          onClick={onClear}
          className="min-h-11 px-2 text-sm text-red transition-opacity hover:opacity-80"
        >
          Remove
        </button>
      </figcaption>
    </figure>
  );
}

function JsonField({
  label,
  value,
  onChange,
  hint,
  rows = 6,
}: {
  label: string;
  value: any;
  onChange: (v: any) => void;
  hint?: string;
  rows?: number;
}) {
  const [raw, setRaw] = useState(() => JSON.stringify(value ?? null, null, 2));
  const [invalid, setInvalid] = useState(false);
  return (
    <Field label={label} hint={hint}>
      <TextArea
        rows={rows}
        value={raw}
        className={invalid ? "border-red font-mono text-sm" : "font-mono text-sm"}
        onChange={(e) => {
          setRaw(e.target.value);
          try {
            onChange(JSON.parse(e.target.value));
            setInvalid(false);
          } catch {
            setInvalid(true);
          }
        }}
      />
      {invalid && <span className="mt-1 block text-xs text-red">Invalid JSON — changes not applied yet.</span>}
    </Field>
  );
}

interface GalleryItem {
  public_id?: string;
  src?: string;
  alt?: string;
  caption?: string;
}

/**
 * A gallery, edited by looking at it.
 *
 * This was a textarea containing raw JSON — an array of objects with
 * `public_id`, `alt` and `caption` keys, which you were expected to type, with
 * ids copied by hand from the media library. On a phone that is not a slow
 * workflow, it is an impossible one: it needs a keyboard, a second window and
 * knowledge of how Cloudinary names things.
 *
 * The pictures are pictures now. Add opens the same multi-select picker the
 * rest of the studio uses, each one can be moved or removed, and the caption
 * and description sit under the thumbnail they belong to. The stored shape is
 * unchanged, so galleries built the old way still open and still render.
 */
function GalleryEditor({ data, onChange }: EditorProps) {
  const items: GalleryItem[] = Array.isArray(data.items) ? data.items : [];
  let mediaSelector: ReturnType<typeof useMediaSelector> | null = null;
  try {
    mediaSelector = useMediaSelector();
  } catch {
    // Rendered outside the provider — the Add button simply is not offered.
  }

  const write = (next: GalleryItem[]) => onChange({ ...data, items: next });

  const update = (index: number, patch: Partial<GalleryItem>) =>
    write(items.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    write(next);
  };

  return (
    /* The Grid/Columns dropdown that used to sit here is now the Presentation
       picker below the editor, which writes the same `data.layout` and offers
       the four V1 arrangements. `"columns"` remains a valid stored value and
       keeps rendering two-up; it is simply not something to newly choose. */
    <div className="space-y-3">
      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((item, index) => {
            const ref = item.public_id ?? item.src ?? "";
            const src = mediaSrc(ref, { width: 160 });
            return (
              <li
                key={`${ref}-${index}`}
                className="flex gap-3 rounded-md border border-line bg-raise p-2"
              >
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded border border-line bg-surface">
                  {isPendingRef(ref) ? (
                    <PendingPhoto photoRef={ref} className="h-full" />
                  ) : src ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={src} alt="" className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1 space-y-2">
                  <TextInput
                    value={item.caption ?? ""}
                    onChange={(e) => update(index, { caption: e.target.value })}
                    placeholder="Caption"
                  />
                  <TextInput
                    value={item.alt ?? ""}
                    onChange={(e) => update(index, { alt: e.target.value })}
                    placeholder="Describe it for screen readers"
                  />
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label={`Move photo ${index + 1} earlier`}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded text-faint transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === items.length - 1}
                      aria-label={`Move photo ${index + 1} later`}
                      className="flex min-h-11 min-w-11 items-center justify-center rounded text-faint transition-colors hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden>
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>
                    <button
                      type="button"
                      onClick={() => write(items.filter((_, i) => i !== index))}
                      className="ml-auto min-h-11 px-2 text-sm text-red transition-opacity hover:opacity-80"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {mediaSelector && (
        <button
          type="button"
          onClick={() =>
            mediaSelector?.openMultiSelector((picks) => {
              write([
                ...items,
                ...picks.map((pick) => ({
                  public_id: pick.ref,
                  alt: pick.alt ?? "",
                  caption: "",
                })),
              ]);
            }, "Add photos")
          }
          className="min-h-12 w-full rounded-md border border-dashed border-line-strong text-sm font-semibold text-soft transition-colors hover:border-pen hover:text-pen"
        >
          + Add photos
        </button>
      )}

      {items.length === 0 && (
        <p className="text-xs text-faint">No photos yet.</p>
      )}
    </div>
  );
}

const EDITORS: Record<BlockType, (p: EditorProps) => React.JSX.Element> = {
  heading: ({ data, onChange }) => (
    <div className="grid gap-3 sm:grid-cols-[100px_1fr]">
      <Field label="Level">
        <Select value={data.level ?? 2} onChange={(e) => onChange({ ...data, level: Number(e.target.value) })}>
          <option value={2}>H2</option>
          <option value={3}>H3</option>
          <option value={4}>H4</option>
        </Select>
      </Field>
      <Field label="Text">
        <TextInput value={data.text ?? ""} onChange={(e) => onChange({ ...data, text: e.target.value })} />
      </Field>
    </div>
  ),
  paragraph: ({ data, onChange }) => (
    <Field label="Text" hint="Inline markdown allowed: **bold**, *italic*, [links](url).">
      <TextArea rows={4} value={data.text ?? ""} onChange={(e) => onChange({ ...data, text: e.target.value })} />
    </Field>
  ),
  markdown: ({ data, onChange }) => (
    <Field label="Markdown">
      <TextArea rows={8} className="font-mono text-sm" value={data.md ?? ""} onChange={(e) => onChange({ ...data, md: e.target.value })} />
    </Field>
  ),
  image: ({ data, onChange }) => (
    <div className="space-y-3">
      <MediaField
        label="Image"
        value={data.public_id ?? data.src ?? ""}
        onChange={(v) => onChange({ ...data, public_id: v, src: undefined })}
        onSelectAsset={(id, alt) =>
          onChange({ ...data, public_id: id, alt: alt || data.alt || "", src: undefined })
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Alt text">
          <TextInput value={data.alt ?? ""} onChange={(e) => onChange({ ...data, alt: e.target.value })} />
        </Field>
        <Field label="Caption">
          <TextInput value={data.caption ?? ""} onChange={(e) => onChange({ ...data, caption: e.target.value })} />
        </Field>
      </div>
    </div>
  ),
  gallery: ({ data, onChange }) => <GalleryEditor data={data} onChange={onChange} />,
  youtube: ({ data, onChange }) => (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="YouTube ID or link" hint="Paste the id, the watch/share URL, or the full <iframe> — I'll find the id.">
        <TextInput value={data.youtube_id ?? ""} onChange={(e) => onChange({ ...data, youtube_id: e.target.value })} />
      </Field>
      <Field label="Caption">
        <TextInput value={data.caption ?? ""} onChange={(e) => onChange({ ...data, caption: e.target.value })} />
      </Field>
    </div>
  ),
  "loop-clip": ({ data, onChange }) => (
    <div className="space-y-3">
      <LoopClipField value={data.src ?? ""} onChange={(src) => onChange({ ...data, src })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Fit" hint="How the clip fills its frame.">
          <Select value={data.fit ?? "cover"} onChange={(e) => onChange({ ...data, fit: e.target.value })}>
            <option value="cover">Cover — fills the frame, may crop</option>
            <option value="contain">Contain — shows the whole clip</option>
          </Select>
        </Field>
        <Field label="Caption">
          <TextInput value={data.caption ?? ""} onChange={(e) => onChange({ ...data, caption: e.target.value })} />
        </Field>
      </div>
      <p className="text-xs text-faint">
        Always plays muted, looping and silent — that's what makes it a Loop Clip rather than a Video.
        For anything with sound or longer than a minute, use the YouTube block instead.
      </p>
    </div>
  ),
  embed: ({ data, onChange }) => (
    <div className="space-y-3">
      <Field
        label="Embed URL or <iframe> code"
        hint="Paste the share URL or the whole <iframe> snippet (Figma, CodePen, Maps…). I'll pull out the src and size automatically."
      >
        <TextArea rows={3} value={data.url ?? ""} onChange={(e) => onChange({ ...data, url: e.target.value })} />
      </Field>
      <Field label="Provider (optional)" hint="Just for the accessible title — e.g. figma, codepen.">
        <TextInput value={data.provider ?? ""} placeholder="figma, codepen…" onChange={(e) => onChange({ ...data, provider: e.target.value })} />
      </Field>
    </div>
  ),
  quote: ({ data, onChange }) => (
    <div className="space-y-3">
      <Field label="Quote">
        <TextArea rows={3} value={data.text ?? ""} onChange={(e) => onChange({ ...data, text: e.target.value })} />
      </Field>
      <Field label="Source">
        <TextInput value={data.source ?? ""} onChange={(e) => onChange({ ...data, source: e.target.value })} />
      </Field>
    </div>
  ),
  divider: ({ data, onChange }) => (
    <Field label="Style">
      <Select value={data.style ?? "line"} onChange={(e) => onChange({ ...data, style: e.target.value })}>
        <option value="line">Dashed line</option>
        <option value="dots">Dots</option>
        <option value="scribble">Scribble</option>
      </Select>
    </Field>
  ),
  code: ({ data, onChange }) => (
    <div className="space-y-3">
      <Field label="Language">
        <TextInput value={data.language ?? ""} onChange={(e) => onChange({ ...data, language: e.target.value })} />
      </Field>
      <Field label="Code">
        <TextArea rows={8} className="font-mono text-sm" value={data.code ?? ""} onChange={(e) => onChange({ ...data, code: e.target.value })} />
      </Field>
    </div>
  ),
  button: ({ data, onChange }) => (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Label">
        <TextInput value={data.label ?? ""} onChange={(e) => onChange({ ...data, label: e.target.value })} />
      </Field>
      <Field label="Href">
        <TextInput value={data.href ?? ""} onChange={(e) => onChange({ ...data, href: e.target.value })} />
      </Field>
      <Field label="Variant">
        <Select value={data.variant ?? "pen"} onChange={(e) => onChange({ ...data, variant: e.target.value })}>
          <option value="pen">Pen (primary)</option>
          <option value="ghost">Ghost</option>
        </Select>
      </Field>
    </div>
  ),
  link: ({ data, onChange }) => <LinkBlockEditor data={data} onChange={onChange} />,
  file: ({ data, onChange }) => (
    <div className="space-y-3">
      <MediaField
        label="File"
        accept="*/*"
        value={data.public_id ?? data.src ?? ""}
        onChange={(v) => onChange({ ...data, public_id: v, src: undefined })}
        onSelectAsset={(id) =>
          onChange({
            ...data,
            public_id: id,
            filename: data.filename || id.split("/").pop() || "",
            src: undefined,
          })
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Filename (shown to visitors)">
          <TextInput value={data.filename ?? ""} onChange={(e) => onChange({ ...data, filename: e.target.value })} />
        </Field>
        <Field label="Size in bytes (optional)">
          <TextInput type="number" value={data.size ?? ""} onChange={(e) => onChange({ ...data, size: Number(e.target.value) || undefined })} />
        </Field>
      </div>
    </div>
  ),
  html: ({ data, onChange }) => (
    <Field
      label="Custom HTML"
      hint="Structure and text only. Scripts, styles and frames are removed before this is stored."
    >
      <HtmlBlockEditor value={data.html ?? ""} onChange={(html) => onChange({ ...data, html })} tall />
    </Field>
  ),
  custom: ({ data, onChange }) => (
    <div className="space-y-3">
      <Field label="Component" hint="Registered in components/lab/registry.tsx (e.g. ink-field, doodle-pad).">
        <TextInput value={data.component ?? ""} onChange={(e) => onChange({ ...data, component: e.target.value })} />
      </Field>
      <JsonField label="Props" value={data.props ?? {}} onChange={(props) => onChange({ ...data, props })} rows={4} />
    </div>
  ),
};

export function BlockEditorFields({
  type,
  data,
  onChange,
}: {
  type: BlockType;
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
}) {
  const Editor = EDITORS[type];
  const supportsSpan = ["image", "gallery", "youtube", "embed", "code", "custom", "divider"].includes(type);

  return (
    <div className="space-y-4">
      <Editor data={data} onChange={onChange} />

      {/* Above the margin/width controls, because it belongs to the block
          rather than to the page: it changes what the thing *is* on screen,
          not how much room is left around it. */}
      {hasLayoutChoices(type) && (
        <div className="border-t border-line pt-4">
          <LayoutPicker type={type} data={data} onChange={onChange} />
        </div>
      )}

      <div className="border-t border-line pt-4 mt-4 space-y-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-faint">
          Block Layout Options
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vertical Margin">
            <Select
              value={resolveSpacing(data)}
              onChange={(e) => onChange({ ...data, spacing: e.target.value })}
            >
              <option value="none">None (0px)</option>
              <option value="small">Small margin</option>
              <option value="medium">Medium (standard)</option>
              <option value="large">Large margin</option>
            </Select>
          </Field>

          {supportsSpan && (
            /* This control used to write `data.width`, which on an image block
               was also the pixel width handed to Cloudinary — so choosing Wide
               here produced `w_wide` in the URL and a broken photo. It writes
               `data.span` now, and normalizeBlockLayout() retires the old key
               from this block on the way past. */
            <Field label="Layout Width">
              <Select
                value={resolveSpan(data)}
                onChange={(e) =>
                  onChange({ ...normalizeBlockLayout(data), span: e.target.value })
                }
              >
                <option value="prose">Standard Prose</option>
                <option value="wide">Wide Width</option>
                <option value="full">Full Screen Width</option>
              </Select>
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}
