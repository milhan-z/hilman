/**
 * What each editable page actually contains.
 *
 * These schemas replace the "structured content (JSON)" textarea. Editing the
 * About page should not require remembering that `timeline` is an array of
 * `{ year, text }` — the form knows.
 */

export type FieldSpec =
  | { kind: "text"; key: string; label: string; hint?: string; placeholder?: string }
  | { kind: "longtext"; key: string; label: string; hint?: string; rows?: number }
  | { kind: "media"; key: string; label: string; hint?: string }
  | { kind: "url"; key: string; label: string; hint?: string; placeholder?: string }
  | { kind: "stringList"; key: string; label: string; hint?: string; itemLabel: string; multiline?: boolean }
  | {
      kind: "objectList";
      key: string;
      label: string;
      hint?: string;
      itemLabel: string;
      columns: { key: string; label: string; multiline?: boolean; placeholder?: string }[];
    };

export interface PageSchema {
  slug: string;
  title: string;
  blurb: string;
  fields: FieldSpec[];
}

export const PAGE_SCHEMAS: Record<string, PageSchema> = {
  home: {
    slug: "home",
    title: "Home",
    blurb:
      "The first screen. One clear sentence about what you do beats a list of job titles.",
    fields: [
      {
        kind: "longtext",
        key: "headline",
        label: "Opening headline",
        hint: "A short introduction that sounds like you. Keep it easy to read on a phone.",
        rows: 3,
      },
      {
        kind: "longtext",
        key: "intro",
        label: "Positioning sentence",
        hint: "One or two sentences a stranger can understand. Shown under your name.",
        rows: 3,
      },
      {
        kind: "text",
        key: "note",
        label: "Personal note",
        hint: "A small detail, interest, or thought. Appears on the notebook cover when no Home photo is set.",
      },
      { kind: "media", key: "portrait", label: "Home photo", hint: "An optional real photo of you or a moment you want to share. Cloudinary public_id or Cloudinary image URL." },
      { kind: "text", key: "portrait_alt", label: "Photo description", hint: "Describe the image for people using a screen reader." },
      { kind: "text", key: "portrait_caption", label: "Photo caption", hint: "A short story or detail about this moment." },
      {
        kind: "text",
        key: "journal_hook",
        label: "Journal link label",
        hint: "Text on the link to the journal, e.g. “Read the notes”.",
      },
      {
        kind: "text",
        key: "field",
        label: "Creative interests",
        hint: "Shown beside your studies, e.g. “Design · Media · Code”. Leave empty to omit your interests.",
      },
      {
        kind: "text",
        key: "based",
        label: "Based in",
        hint: "An optional public location beside your studies and interests. Leave empty to omit it.",
      },
    ],
  },

  about: {
    slug: "about",
    title: "About",
    blurb:
      "Your story, interests, and the people who are part of it. Add real photos and memories when you're ready. Your introduction starts with the profile you shared; optional photos, experience, and tools only appear when filled in.",
    fields: [
      { kind: "media", key: "portrait", label: "Portrait", hint: "Cloudinary public_id or Cloudinary image URL." },
      {
        kind: "media",
        key: "portrait_cutout",
        label: "Portrait cut-out",
        hint: "A photo of you with the background removed (a transparent PNG). Shown instead of the portrait, standing on the page like a cut-out sticker.",
      },
      { kind: "text", key: "portrait_alt", label: "Portrait description", hint: "Describe your photo for people using a screen reader." },
      { kind: "text", key: "portrait_caption", label: "Portrait caption", hint: "Tell us a little about the moment in this photo." },
      { kind: "text", key: "personal_note", label: "Personal note", hint: "A short aside in your own voice. Appears next to your story." },
      {
        kind: "longtext",
        key: "lede",
        label: "Lede",
        hint: "The large opening line. One sentence.",
        rows: 3,
      },
      {
        kind: "stringList",
        key: "story",
        label: "Bio",
        itemLabel: "Paragraph",
        multiline: true,
        hint: "One entry per paragraph.",
      },
      {
        kind: "stringList",
        key: "interests",
        label: "Personal interests",
        itemLabel: "Interest",
        hint: "Things you enjoy, inside or outside your work. Short phrases work well.",
      },
      {
        kind: "text",
        key: "community_heading",
        label: "People & community heading",
        hint: "Introduce the people and shared experiences that matter to you.",
      },
      {
        kind: "longtext",
        key: "community_story",
        label: "People & community story",
        hint: "Share what collaboration, organizations, or ITS Global Engagement mean to you. Keep it specific and true.",
        rows: 6,
      },
      {
        kind: "objectList",
        key: "moments",
        label: "Personal moments",
        itemLabel: "Moment",
        hint: "A photo and a small story from your life. Photos are optional; text-only moments also work. Use a Cloudinary public_id or Cloudinary image URL.",
        columns: [
          { key: "title", label: "Moment title", placeholder: "A moment worth remembering" },
          { key: "image", label: "Photo", placeholder: "Cloudinary public_id or Cloudinary URL" },
          { key: "alt", label: "Image description", placeholder: "Describe what is in the photo" },
          { key: "caption", label: "The story", multiline: true },
        ],
      },
      {
        kind: "stringList",
        key: "focus",
        label: "Focus areas",
        itemLabel: "Focus",
        hint: "What you actually want to be hired for. Keep it to three or four.",
      },
      {
        kind: "objectList",
        key: "timeline",
        label: "Selected experience",
        itemLabel: "Entry",
        hint: "Kept loose on purpose — year plus one line.",
        columns: [
          { key: "year", label: "Year", placeholder: "2025" },
          { key: "text", label: "What happened", multiline: true },
        ],
      },
      {
        kind: "stringList",
        key: "toolbox",
        label: "Toolbox",
        itemLabel: "Tool",
        hint: "Tools you genuinely use. Shown as tags.",
      },
      {
        kind: "stringList",
        key: "currently",
        label: "Currently",
        itemLabel: "Line",
        hint: "What you're working on right now. Appears on your About page.",
      },
      { kind: "url", key: "cv_url", label: "CV link", hint: "Optional. A public link to your CV." },
    ],
  },

  connect: {
    slug: "connect",
    title: "Connect",
    blurb: "How people reach you, and what you're open to.",
    fields: [
      { kind: "longtext", key: "lede", label: "Lede", rows: 3 },
      {
        kind: "longtext",
        key: "availability",
        label: "Availability",
        hint: "What kind of work you're open to right now.",
        rows: 3,
      },
      { kind: "text", key: "note", label: "Handwritten note", hint: "A short aside in the margin." },
    ],
  },
};

/** Reads the stored value for a field, coercing legacy shapes into the form's shape. */
export function readField(data: Record<string, any>, field: FieldSpec): any {
  const raw = data?.[field.key];
  switch (field.kind) {
    case "stringList":
      return Array.isArray(raw) ? raw.map((v) => (typeof v === "string" ? v : String(v ?? ""))) : [];
    case "objectList":
      return Array.isArray(raw)
        ? raw.map((row) =>
            Object.fromEntries(
              (field as Extract<FieldSpec, { kind: "objectList" }>).columns.map((c) => [
                c.key,
                typeof row?.[c.key] === "string" ? row[c.key] : String(row?.[c.key] ?? ""),
              ])
            )
          )
        : [];
    default:
      return typeof raw === "string" ? raw : raw == null ? "" : String(raw);
  }
}

/** Drop unused optional fields, but retain an intentional blank over a public default. */
export function cleanPageData(
  schema: PageSchema,
  form: Record<string, any>,
  existing: Record<string, any>,
  preserveEmptyFields: readonly string[] = []
): Record<string, any> {
  // Keys the schema doesn't manage are preserved untouched.
  const known = new Set(schema.fields.map((f) => f.key));
  const out: Record<string, any> = Object.fromEntries(
    Object.entries(existing ?? {}).filter(([k]) => !known.has(k))
  );
  const preserveEmpty = new Set(preserveEmptyFields);

  for (const field of schema.fields) {
    const value = form[field.key];
    if (field.kind === "stringList") {
      const list = (Array.isArray(value) ? value : []).map((v) => String(v ?? "").trim()).filter(Boolean);
      if (list.length || preserveEmpty.has(field.key)) out[field.key] = list;
      continue;
    }
    if (field.kind === "objectList") {
      const rows = (Array.isArray(value) ? value : [])
        .map((row) =>
          Object.fromEntries(Object.entries(row ?? {}).map(([k, v]) => [k, String(v ?? "").trim()]))
        )
        .filter((row) => Object.values(row).some(Boolean));
      if (rows.length || preserveEmpty.has(field.key)) out[field.key] = rows;
      continue;
    }
    const text = String(value ?? "").trim();
    if (text || preserveEmpty.has(field.key)) out[field.key] = text;
  }
  return out;
}
