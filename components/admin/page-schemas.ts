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
      "Styled after your old About Me page: your photo on a card clipped to a sheet of paper. The card holds your introduction and the things you gravitate towards; your story is handwritten under it, ending on your note, with your work experience and software beside it. The people around you and your moments follow. Anything left empty is simply left out.",
    fields: [
      {
        kind: "media",
        key: "portrait_cutout",
        label: "Portrait cut-out",
        hint: "A half-body photo of you with the background removed (a transparent PNG), about 4:5. Shown on the card's yellow block.",
      },
      { kind: "media", key: "portrait", label: "Portrait", hint: "Used on the yellow block when there is no cut-out. Cloudinary public_id or Cloudinary image URL." },
      { kind: "text", key: "portrait_alt", label: "Portrait description", hint: "Describe your photo for people using a screen reader." },
      { kind: "text", key: "portrait_caption", label: "Portrait caption", hint: "Optional. A few handwritten words under the photo." },
      {
        kind: "longtext",
        key: "lede",
        label: "Introduction",
        hint: "One sentence on the card, under “Hi, I’m Hilman.” — no need to say your name again.",
        rows: 3,
      },
      {
        kind: "stringList",
        key: "interests",
        label: "Things you gravitate towards",
        itemLabel: "Interest",
        hint: "Listed in a box on the card. Short phrases work well.",
      },
      {
        kind: "stringList",
        key: "story",
        label: "Story",
        itemLabel: "Paragraph",
        multiline: true,
        hint: "Handwritten on the sheet under the card. One entry per paragraph.",
      },
      {
        kind: "text",
        key: "personal_note",
        label: "Personal note",
        hint: "One short line in your own voice, written in red at the end of your story.",
      },
      {
        kind: "objectList",
        key: "timeline",
        label: "Work experience",
        itemLabel: "Role",
        hint: "Newest first: when, what you did, and where. Shown on the sheet as a timeline.",
        columns: [
          { key: "year", label: "When", placeholder: "July 2023 – July 2024" },
          { key: "text", label: "Role", multiline: true },
          { key: "place", label: "Where", placeholder: "Organisation or place" },
        ],
      },
      {
        kind: "stringList",
        key: "toolbox",
        label: "Software",
        itemLabel: "Tool",
        hint: "Tools you genuinely use. Photoshop, Illustrator, Premiere Pro, After Effects, Lightroom, InDesign, Canva and Figma get their icon; anything else is shown as a tag.",
      },
      {
        kind: "stringList",
        key: "focus",
        label: "Focus areas",
        itemLabel: "Focus",
        hint: "What you actually want to be hired for. Keep it to three or four.",
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
