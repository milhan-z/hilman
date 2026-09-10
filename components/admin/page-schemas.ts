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
        key: "intro",
        label: "Positioning sentence",
        hint: "One or two sentences a stranger can understand. Shown under your name.",
        rows: 3,
      },
      {
        kind: "text",
        key: "journal_hook",
        label: "Journal link label",
        hint: "Text on the link to the journal, e.g. “Read the notes”.",
      },
      {
        kind: "text",
        key: "field",
        label: "Field (specimen plate)",
        hint: "e.g. “Design · Media · Tech”. Leave empty to hide the row.",
      },
      {
        kind: "text",
        key: "based",
        label: "Based in (specimen plate)",
        hint: "Only fill this in if you want it public. Leave empty to hide the row.",
      },
    ],
  },

  about: {
    slug: "about",
    title: "About",
    blurb:
      "Everything a visitor needs to know who you are. All of it is optional — empty fields simply don't render.",
    fields: [
      { kind: "media", key: "portrait", label: "Portrait", hint: "Cloudinary public_id, or a full image URL." },
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
        hint: "What you're working on right now. Also appears on the home page.",
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

/** Drops empty values so an untouched field never writes `""` into the page. */
export function cleanPageData(
  schema: PageSchema,
  form: Record<string, any>,
  existing: Record<string, any>
): Record<string, any> {
  // Keys the schema doesn't manage are preserved untouched.
  const known = new Set(schema.fields.map((f) => f.key));
  const out: Record<string, any> = Object.fromEntries(
    Object.entries(existing ?? {}).filter(([k]) => !known.has(k))
  );

  for (const field of schema.fields) {
    const value = form[field.key];
    if (field.kind === "stringList") {
      const list = (value as string[]).map((v) => v.trim()).filter(Boolean);
      if (list.length) out[field.key] = list;
      continue;
    }
    if (field.kind === "objectList") {
      const rows = (value as Record<string, string>[])
        .map((row) =>
          Object.fromEntries(Object.entries(row).map(([k, v]) => [k, String(v ?? "").trim()]))
        )
        .filter((row) => Object.values(row).some(Boolean));
      if (rows.length) out[field.key] = rows;
      continue;
    }
    const text = String(value ?? "").trim();
    if (text) out[field.key] = text;
  }
  return out;
}
