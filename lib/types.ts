/* ── Streams & status ──────────────────────────────────── */

export type Stream = "visual-design" | "visual-stories" | "digital-lab";
export type Status = "draft" | "published";

export const STREAMS: Record<Stream, { name: string; tagline: string; blurb: string }> = {
  "visual-design": {
    name: "Visual Design",
    tagline: "Layout, posters, brand, UI",
    blurb:
      "Visual systems, posters, brand explorations, and interfaces — where composition and intent meet.",
  },
  "visual-stories": {
    name: "Visual Stories",
    tagline: "Editing, photo, video, documentation",
    blurb:
      "Editing, photography, videography, and documentation — telling stories through moving and still frames.",
  },
  "digital-lab": {
    name: "Digital Lab",
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
  | "embed"
  | "quote"
  | "divider"
  | "code"
  | "button"
  | "link"
  | "file"
  | "custom";

export type OwnerType = "project" | "journal" | "page";

export interface Block {
  id: string;
  type: BlockType;
  position: number;
  /** payload — shape depends on `type`, see BLOCK_HINTS / renderer */
  data: Record<string, any>;
}

/** Field hints used by the CMS editor & docs. */
export const BLOCK_HINTS: Record<BlockType, string> = {
  heading: "{ level: 2|3|4, text }",
  paragraph: "{ text } — inline markdown allowed",
  markdown: "{ md }",
  image: "{ public_id | src, alt, caption, width?, height? }",
  gallery: "{ items: [{ public_id | src, alt, caption }], layout: 'grid'|'columns' }",
  youtube: "{ youtube_id, caption }",
  embed: "{ url, provider }",
  quote: "{ text, source }",
  divider: "{ style: 'line'|'dots'|'scribble' }",
  code: "{ language, code }",
  button: "{ label, href, variant: 'pen'|'ghost' }",
  link: "{ url, title, description, thumbnail? }",
  file: "{ public_id | src, filename, size? }",
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

export const DEFAULT_SETTINGS: Settings = {
  hero_roles: ["Designer", "Editor", "Programmer", "Storyteller", "Technologist"],
  socials: [
    { label: "Instagram", url: "https://instagram.com/" },
    { label: "GitHub", url: "https://github.com/" },
    { label: "YouTube", url: "https://youtube.com/" },
    { label: "Email", url: "mailto:hello@hilman.site" },
  ],
  nav: [
    { label: "Works", href: "/works" },
    { label: "Journal", href: "/journal" },
    { label: "Lab", href: "/lab" },
    { label: "Desk", href: "/desk" },
    { label: "About", href: "/about" },
    { label: "Connect", href: "/connect" },
  ],
  featured: {},
};
