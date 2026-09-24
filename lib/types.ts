/* ── Streams & status ──────────────────────────────────── */

export type Stream = "visual-design" | "visual-stories" | "digital-lab";
export type Status = "draft" | "published";

export const STREAMS: Record<Stream, { name: string; tagline: string; blurb: string }> = {
  "visual-design": {
    name: "Design",
    tagline: "Layout, posters, brand, UI",
    blurb:
      "Visual systems, posters, brand explorations, and interfaces — where composition and intent meet.",
  },
  "visual-stories": {
    name: "Film & Photo",
    tagline: "Editing, photo, video, documentation",
    blurb:
      "Editing, photography, videography, and documentation — telling stories through moving and still frames.",
  },
  "digital-lab": {
    name: "Code",
    tagline: "Web, tools, creative code",
    blurb:
      "Programming, web builds, tools, and creative coding — finished tech projects with a story behind them.",
  },
};

/* ── Content blocks (polymorphic engine) ───────────────── */

export type BlockType =
  | "heading"
  | "paragraph"
  | "markdown"
  | "image"
  | "gallery"
  | "youtube"
  | "loop-clip"
  | "embed"
  | "quote"
  | "divider"
  | "code"
  | "button"
  | "link"
  | "file"
  | "html"
  | "custom";

export type OwnerType = "project" | "journal" | "page";

export interface Block {
  id: string;
  type: BlockType;
  position: number;
  /** payload — shape depends on `type`, see BLOCK_HINTS / renderer */
  data: Record<string, any>;
}

/**
 * Field hints used by the CMS editor & docs.
 *
 * These describe the keys a block type owns. Two further keys belong to every
 * block and are not listed per type — `span` and `spacing`, documented in
 * lib/block-layout.ts and surfaced to the importer through LAYOUT_KEYS in
 * lib/studio-import-reference.ts.
 *
 * `layout` on the four media types is optional in the strongest sense: leaving
 * it out is a decision, not an omission, and gives the presentation these
 * blocks have always had. See lib/media-layouts.ts.
 */
export const BLOCK_HINTS: Record<BlockType, string> = {
  heading: "{ level: 2|3|4, text }",
  paragraph: "{ text } — inline markdown allowed",
  markdown: "{ md }",
  image: "{ public_id | src, alt, caption, width?, height?, layout?: 'default'|'full'|'browser'|'phone'|'polaroid' } — width/height in pixels",
  gallery: "{ items: [{ public_id | src, alt, caption }], layout?: 'grid'|'carousel'|'stack'|'accordion' } — `layout` is this block's own key, not the page span",
  youtube: "{ youtube_id (id · URL · or <iframe>), caption, layout?: 'default'|'cinema' }",
  "loop-clip": "{ src (an https MP4 URL, or pending: while it uploads), caption, fit: 'cover'|'contain', layout?: 'default'|'browser'|'phone'|'floating' } — always renders muted, autoplay, loop",
  embed: "{ url (share URL or full <iframe>), provider?, height? }",
  quote: "{ text, source }",
  divider: "{ style: 'line'|'dots'|'scribble' }",
  code: "{ language, code }",
  button: "{ label, href, variant: 'pen'|'ghost' }",
  link: "{ url (https://… or an internal path like /works/slug), title, description, thumbnail?, label?, presentation?: 'default'|'related' } — `related` is the editorial cross-link card",
  file: "{ public_id | src, filename, size? }",
  html: "{ html } — pasted markup, sanitised before it is stored or shown",
  custom: "{ component, props } — see components/lab/registry",
};

/* ── Rows ───────────────────────────────────────────────── */

export interface Project {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  excerpt: string | null;
  stream: Stream;
  thumbnail_public_id: string | null;
  cover_public_id: string | null;
  year: number | null;
  status: Status;
  featured: boolean;
  sort_order: number;
  meta: {
    role?: string;
    tools?: string[];
    client?: string;
    links?: { label: string; url: string }[];
  };
  created_at?: string;
  updated_at?: string;
  published_at: string | null;
  tags?: TagRow[];
  blocks?: Block[];
  /** How many people have read it — public reads only; see lib/readers.ts. */
  reads?: number;
}

export interface JournalPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  cover_public_id: string | null;
  status: Status;
  featured: boolean;
  reading_minutes: number;
  published_at: string | null;
  created_at?: string;
  updated_at?: string;
  tags?: TagRow[];
  blocks?: Block[];
  /** How many people have read it — public reads only; see lib/readers.ts. */
  reads?: number;
}

export interface PageRow {
  id: string;
  slug: string;
  title: string;
  data: Record<string, any>;
  blocks?: Block[];
}

export interface TagRow {
  id: string;
  slug: string;
  name: string;
}

export interface CategoryRow {
  id: string;
  slug: string;
  name: string;
  stream: Stream | null;
  description: string | null;
  sort_order: number;
}

export interface MediaRow {
  id: string;
  public_id: string;
  kind: "image" | "file";
  format: string | null;
  width: number | null;
  height: number | null;
  bytes: number | null;
  folder: string | null;
  alt: string | null;
  title: string | null;
  created_at?: string;
}

export interface MessageRow {
  id: string;
  name: string;
  email: string;
  body: string;
  created_at: string;
}

export interface Settings {
  hero_roles: string[];
  socials: { label: string; url: string }[];
  nav: { label: string; href: string }[];
  featured: { note?: string };
}

/**
 * Fallbacks used when a settings row is missing.
 *
 * `socials` is deliberately empty. It used to hold placeholder profiles
 * (bare instagram.com / github.com links and a hello@hilman.site address)
 * which shipped to the live site and sent visitors to accounts that were not
 * Hilman's. An unset link is better than a wrong one: the UI hides the
 * section until real accounts are entered in Studio → Settings.
 */
export const DEFAULT_SETTINGS: Settings = {
  hero_roles: ["Designer", "Editor", "Programmer", "Storyteller", "Technologist"],
  socials: [],
  nav: [
    { label: "Works", href: "/works" },
    { label: "Journal", href: "/journal" },
    { label: "Lab", href: "/lab" },
    { label: "About", href: "/about" },
    { label: "Connect", href: "/connect" },
  ],
  featured: {},
};
