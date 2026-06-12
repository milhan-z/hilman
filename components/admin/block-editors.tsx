"use client";

import { useState } from "react";
import { Field, Select, TextArea, TextInput } from "./fields";
import { uploadToCloudinary } from "./upload";
import { useMediaSelector } from "./media-library-context";
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
  { type: "embed", label: "Embed" },
  { type: "quote", label: "Quote" },
  { type: "divider", label: "Divider" },
  { type: "code", label: "Code" },
  { type: "button", label: "Button" },
  { type: "link", label: "Link card" },
  { type: "file", label: "File" },
  { type: "custom", label: "Custom (experiment)" },
];

export const DEFAULT_DATA: Record<BlockType, Record<string, any>> = {
  heading: { level: 2, text: "" },
  paragraph: { text: "" },
  markdown: { md: "" },
  image: { public_id: "", alt: "", caption: "" },
  gallery: { layout: "grid", items: [] },
  youtube: { youtube_id: "", caption: "" },
  embed: { url: "", provider: "" },
  quote: { text: "", source: "" },
  divider: { style: "line" },
  code: { language: "ts", code: "" },
  button: { label: "", href: "", variant: "pen" },
  link: { url: "", title: "", description: "" },
  file: { public_id: "", filename: "" },
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
    case "embed": return data.url || "(no url)";
    case "quote": return (data.text || "").slice(0, 80) || "(empty quote)";
    case "divider": return data.style ?? "line";
    case "code": return `${data.language ?? ""} · ${(data.code || "").slice(0, 50)}`;
    case "button": return data.label || "(no label)";
    case "link": return data.title || data.url || "(no link)";
    case "file": return data.filename || "(no file)";
    case "custom": return data.component || "(no component)";
  }
}

interface EditorProps {
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
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
  const [busy, setBusy] = useState(false);
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

  return (
    <Field label={label} hint="Cloudinary public_id or URL — upload directly or choose from library.">
      <div className="flex gap-2">
        <TextInput value={value} onChange={(e) => onChange(e.target.value)} placeholder="folder/asset-id or https://…" />
        
        {mediaSelector && (
          <button
            type="button"
            onClick={handleChooseFromLibrary}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded border border-line bg-raise px-3 text-sm text-soft hover:border-pen hover:text-pen transition-colors"
            title="Choose from media library"
          >
            Library
          </button>
        )}

        <label className="inline-flex min-h-[44px] shrink-0 cursor-pointer items-center rounded border border-line px-3 text-sm text-soft transition-colors hover:border-pen hover:text-pen">
          {busy ? "Uploading…" : "Upload"}
          <input
            type="file"
            accept={accept}
            className="sr-only"
            disabled={busy}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              setBusy(true);
              setError(null);
              try {
                const asset = await uploadToCloudinary(file);
                if (onSelectAsset) {
                  onSelectAsset(asset.public_id);
                } else {
                  onChange(asset.public_id);
                }
              } catch (err: any) {
                setError(err.message);
              } finally {
                setBusy(false);
              }
            }}
          />
        </label>
      </div>
      {error && <span className="mt-1 block text-xs text-red">{error}</span>}
    </Field>
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

const EDITORS: Record<BlockType, (p: EditorProps) => JSX.Element> = {
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
  gallery: ({ data, onChange }) => (
    <div className="space-y-3">
      <Field label="Layout">
        <Select value={data.layout ?? "grid"} onChange={(e) => onChange({ ...data, layout: e.target.value })}>
          <option value="grid">Grid (3-up)</option>
          <option value="columns">Columns (2-up)</option>
        </Select>
      </Field>
      <JsonField
        label="Items"
        hint='[{ "public_id": "…", "alt": "…", "caption": "…" }] — use Media Library to upload & copy ids.'
        value={data.items ?? []}
        onChange={(items) => onChange({ ...data, items })}
      />
    </div>
  ),
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
  link: ({ data, onChange }) => (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="URL">
          <TextInput value={data.url ?? ""} onChange={(e) => onChange({ ...data, url: e.target.value })} />
        </Field>
        <Field label="Title">
          <TextInput value={data.title ?? ""} onChange={(e) => onChange({ ...data, title: e.target.value })} />
        </Field>
      </div>
      <Field label="Description">
        <TextInput value={data.description ?? ""} onChange={(e) => onChange({ ...data, description: e.target.value })} />
      </Field>
      <MediaField
        label="Thumbnail (optional)"
        value={data.thumbnail ?? ""}
        onChange={(v) => onChange({ ...data, thumbnail: v })}
        onSelectAsset={(id) => onChange({ ...data, thumbnail: id })}
      />
    </div>
  ),
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
  const supportsWidth = ["image", "gallery", "youtube", "embed", "code", "custom", "divider"].includes(type);

  return (
    <div className="space-y-4">
      <Editor data={data} onChange={onChange} />
      
      <div className="border-t border-line pt-4 mt-4 space-y-3">
        <p className="text-2xs font-semibold uppercase tracking-wider text-faint">
          Block Layout Options
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Vertical Margin">
            <Select
              value={data.spacing ?? "medium"}
              onChange={(e) => onChange({ ...data, spacing: e.target.value })}
            >
              <option value="none">None (0px)</option>
              <option value="small">Small margin</option>
              <option value="medium">Medium (standard)</option>
              <option value="large">Large margin</option>
            </Select>
          </Field>

          {supportsWidth && (
            <Field label="Layout Width">
              <Select
                value={data.width ?? "prose"}
                onChange={(e) => onChange({ ...data, width: e.target.value })}
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
