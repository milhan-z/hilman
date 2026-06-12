import type {
  Block,
  CategoryRow,
  JournalPost,
  PageRow,
  Project,
  Settings,
  TagRow,
} from "./types";

/**
 * Mock content — single source of truth.
 * 1. Served directly when Supabase env vars are missing (zero-setup preview).
 * 2. Inserted into Supabase by `npm run seed`.
 * Images use picsum.photos placeholders; replace via the CMS media library.
 */

const img = (seed: string, w = 1600, h = 1000) =>
  `https://picsum.photos/seed/${seed}/${w}/${h}`;

let blockId = 0;
const b = (type: Block["type"], data: Record<string, any>): Block => ({
  id: `mock-${++blockId}`,
  type,
  position: blockId,
  data,
});

/* ── Settings ──────────────────────────────────────────── */

export const mockSettings: Settings = {
  hero_roles: ["Designer", "Editor", "Programmer", "Storyteller", "Technologist"],
  socials: [
    { label: "Instagram", url: "https://instagram.com/hilman" },
    { label: "GitHub", url: "https://github.com/hilman" },
    { label: "YouTube", url: "https://youtube.com/@hilman" },
    { label: "Email", url: "mailto:hello@hilman.site" },
  ],
  nav: [
    { label: "Works", href: "/works" },
    { label: "Journal", href: "/journal" },
    { label: "Lab", href: "/lab" },
    { label: "About", href: "/about" },
    { label: "Connect", href: "/connect" },
  ],
  featured: { note: "Order on the Works page follows sort_order." },
};

/* ── Taxonomy ──────────────────────────────────────────── */

export const mockCategories: CategoryRow[] = [
  { id: "c1", slug: "visual-design", name: "Visual Design", stream: "visual-design", description: "Layout, posters, brand, UI.", sort_order: 1 },
  { id: "c2", slug: "visual-stories", name: "Visual Stories", stream: "visual-stories", description: "Editing, photo, video, documentation.", sort_order: 2 },
  { id: "c3", slug: "digital-lab", name: "Digital Lab", stream: "digital-lab", description: "Web, tools, creative code.", sort_order: 3 },
];

export const mockTags: TagRow[] = [
  { id: "t1", slug: "branding", name: "Branding" },
  { id: "t2", slug: "poster", name: "Poster" },
  { id: "t3", slug: "ui", name: "UI" },
  { id: "t4", slug: "video", name: "Video" },
  { id: "t5", slug: "photography", name: "Photography" },
  { id: "t6", slug: "nextjs", name: "Next.js" },
  { id: "t7", slug: "creative-coding", name: "Creative Coding" },
  { id: "t8", slug: "typography", name: "Typography" },
];

const tag = (slug: string) => mockTags.find((t) => t.slug === slug)!;

/* ── Projects ──────────────────────────────────────────── */

export const mockProjects: Project[] = [
  {
    id: "p1",
    slug: "paper-trail-identity",
    title: "Paper Trail",
    subtitle: "Identity system for an indie zine collective",
    excerpt:
      "A flexible identity built on margins, stamps, and the texture of cheap riso paper — designed to be misprinted.",
    stream: "visual-design",
    thumbnail_public_id: img("paper-trail", 1200, 900),
    cover_public_id: img("paper-trail-cover", 2000, 1100),
    year: 2025,
    status: "published",
    featured: true,
    sort_order: 1,
    meta: {
      role: "Identity & art direction",
      tools: ["Figma", "Illustrator", "Riso"],
      client: "Paper Trail Collective",
      links: [{ label: "Live site", url: "https://example.com" }],
    },
    published_at: "2025-09-12T00:00:00.000Z",
    tags: [tag("branding"), tag("typography"), tag("poster")],
    blocks: [
      b("paragraph", {
        text: "Paper Trail is a zine collective that prints fast and cheap. The brief was honest: *make us look intentional without making us look expensive.* The answer lived in the production constraints themselves.",
      }),
      b("heading", { level: 2, text: "A system that survives misprints" }),
      b("paragraph", {
        text: "Riso printing drifts. Layers misregister. Instead of fighting it, the identity treats drift as a feature — every asset is built from two ink layers that are allowed to slip.",
      }),
      b("image", {
        src: img("paper-trail-spread", 1800, 1100),
        alt: "Zine spreads showing the two-layer riso identity",
        caption: "Two-layer system: structure in ink blue, noise in highlighter yellow.",
      }),
      b("gallery", {
        layout: "grid",
        items: [
          { src: img("pt-poster-1", 900, 1200), alt: "Poster, issue 01", caption: "Issue 01" },
          { src: img("pt-poster-2", 900, 1200), alt: "Poster, issue 02", caption: "Issue 02" },
          { src: img("pt-poster-3", 900, 1200), alt: "Poster, issue 03", caption: "Issue 03" },
        ],
      }),
      b("quote", {
        text: "It finally looks like us — slightly off, on purpose.",
        source: "Paper Trail editors",
      }),
      b("divider", { style: "scribble" }),
      b("heading", { level: 3, text: "Deliverables" }),
      b("markdown", {
        md: "- Logo set + misregistration rules\n- Poster grid (A3 / A2)\n- Zine master template\n- Sticker & stamp sheet",
      }),
      b("button", { label: "Visit the collective", href: "https://example.com", variant: "pen" }),
    ],
  },
  {
    id: "p2",
    slug: "warung-side-a",
    title: "Warung Side A",
    subtitle: "Short documentary about a family-run warung",
    excerpt:
      "Three generations behind one counter. Shot over six evenings, edited like a mixtape — A-side memories, B-side routine.",
    stream: "visual-stories",
    thumbnail_public_id: img("warung", 1200, 900),
    cover_public_id: img("warung-cover", 2000, 1100),
    year: 2025,
    status: "published",
    featured: true,
    sort_order: 2,
    meta: {
      role: "Director, editor, colorist",
      tools: ["Premiere Pro", "DaVinci Resolve", "Sony FX30"],
    },
    published_at: "2025-06-20T00:00:00.000Z",
    tags: [tag("video"), tag("photography")],
    blocks: [
      b("paragraph", {
        text: "Ibu Sari has run the same warung since 1989. Her daughter does the books, her grandson runs the TikTok. The film sits quietly with all three of them.",
      }),
      b("youtube", {
        youtube_id: "dQw4w9WgXcQ",
        caption: "Warung Side A — full short (12 min).",
      }),
      b("heading", { level: 2, text: "Editing like a mixtape" }),
      b("paragraph", {
        text: "The structure borrows from cassette logic: Side A holds the stories people tell about the place, Side B the wordless routine of running it. The cut alternates sides until they blur.",
      }),
      b("gallery", {
        layout: "columns",
        items: [
          { src: img("warung-still-1", 1200, 675), alt: "Still: morning prep", caption: "05:40 — prep" },
          { src: img("warung-still-2", 1200, 675), alt: "Still: regulars at the counter", caption: "19:15 — regulars" },
        ],
      }),
      b("quote", { text: "You don't shoot a warung. You wait until it forgets you're there.", source: "Field note, day 4" }),
    ],
  },
  {
    id: "p3",
    slug: "arsip-engine",
    title: "Arsip Engine",
    subtitle: "A tiny CMS for personal archives",
    excerpt:
      "The block-based content engine that powers this very site — polymorphic blocks, one renderer map, zero lock-in.",
    stream: "digital-lab",
    thumbnail_public_id: img("arsip", 1200, 900),
    cover_public_id: img("arsip-cover", 2000, 1100),
    year: 2026,
    status: "published",
    featured: true,
    sort_order: 3,
    meta: {
      role: "Design + engineering",
      tools: ["Next.js", "TypeScript", "Supabase", "Tailwind"],
      links: [{ label: "Source", url: "https://github.com/" }],
    },
    published_at: "2026-01-15T00:00:00.000Z",
    tags: [tag("nextjs"), tag("ui")],
    blocks: [
      b("paragraph", {
        text: "Every CMS I tried either locked content into rigid templates or dissolved it into untyped soup. Arsip Engine is the middle path: **typed blocks, one polymorphic table, two maps** — type → renderer and type → editor.",
      }),
      b("code", {
        language: "ts",
        code: `// adding a block type = one entry in each map
const renderers: Record<BlockType, FC<BlockProps>> = {
  heading: HeadingBlock,
  image: ImageBlock,
  youtube: YouTubeBlock,
  // ...
};`,
      }),
      b("heading", { level: 2, text: "Why polymorphic blocks" }),
      b("markdown", {
        md: "Projects, journal entries, and pages all share the same `content_blocks` table:\n\n1. **One editor** to maintain instead of three\n2. **One renderer** on the front end\n3. New content types get the whole block library for free",
      }),
      b("embed", { url: "https://codepen.io/", provider: "codepen" }),
      b("link", {
        url: "https://supabase.com/docs",
        title: "Supabase Docs",
        description: "Postgres, Auth, and RLS — the storage layer under the engine.",
      }),
      b("file", {
        src: "https://picsum.photos/seed/spec/800/600",
        filename: "arsip-engine-spec.pdf",
        size: 245000,
      }),
      b("divider", { style: "dots" }),
      b("custom", { component: "ink-field", props: { density: 60 } }),
    ],
  },
  {
    id: "p4",
    slug: "kios-type-specimen",
    title: "Kios",
    subtitle: "Display typeface & specimen site",
    excerpt:
      "A boxy display face drawn from hand-painted kiosk signage, with a specimen site you can mess with.",
    stream: "visual-design",
    thumbnail_public_id: img("kios", 1200, 900),
    cover_public_id: img("kios-cover", 2000, 1100),
    year: 2024,
    status: "published",
    featured: false,
    sort_order: 4,
    meta: { role: "Type design", tools: ["Glyphs", "Figma"] },
    published_at: "2024-11-02T00:00:00.000Z",
    tags: [tag("typography"), tag("poster")],
    blocks: [
      b("paragraph", {
        text: "Kios started as photos of hand-painted signs collected on motorbike rides. The letters are confident, slightly uneven, and unbothered by typographic rules — the typeface keeps all three traits.",
      }),
      b("image", {
        src: img("kios-specimen", 1800, 1100),
        alt: "Kios typeface specimen poster",
        caption: "Specimen poster, weight range Light–Black.",
      }),
    ],
  },
  {
    id: "p5",
    slug: "harbor-light-photo-essay",
    title: "Harbor Light",
    subtitle: "Photo essay: the port before sunrise",
    excerpt: "Forty minutes of blue hour at the fish port — cranes, crates, cigarettes, and the first light.",
    stream: "visual-stories",
    thumbnail_public_id: img("harbor", 1200, 900),
    cover_public_id: img("harbor-cover", 2000, 1100),
    year: 2024,
    status: "published",
    featured: false,
    sort_order: 5,
    meta: { role: "Photography", tools: ["Fuji X-T4"] },
    published_at: "2024-08-10T00:00:00.000Z",
    tags: [tag("photography")],
    blocks: [
      b("paragraph", {
        text: "The port works hardest when the city is still asleep. This essay is one roll of that hour — no staging, no second takes.",
      }),
      b("gallery", {
        layout: "grid",
        items: [
          { src: img("harbor-1", 1200, 800), alt: "Crane silhouette at blue hour", caption: "04:51" },
          { src: img("harbor-2", 1200, 800), alt: "Crates of ice on the dock", caption: "05:07" },
          { src: img("harbor-3", 1200, 800), alt: "First light over the water", caption: "05:32" },
          { src: img("harbor-4", 1200, 800), alt: "Workers sharing coffee", caption: "05:48" },
        ],
      }),
    ],
  },
  {
    id: "p6",
    slug: "tandai-bookmark-tool",
    title: "Tandai",
    subtitle: "A bookmark tool that thinks in margins",
    excerpt:
      "A weekend-project-turned-daily-tool: save links with handwritten-style margin notes instead of folders.",
    stream: "digital-lab",
    thumbnail_public_id: img("tandai", 1200, 900),
    cover_public_id: img("tandai-cover", 2000, 1100),
    year: 2025,
    status: "published",
    featured: false,
    sort_order: 6,
    meta: { role: "Solo build", tools: ["Next.js", "Supabase"] },
    published_at: "2025-03-05T00:00:00.000Z",
    tags: [tag("nextjs"), tag("creative-coding")],
    blocks: [
      b("paragraph", {
        text: "Folders kill bookmarks. Tandai replaces them with margin notes — every saved link gets a scribble explaining *why future me should care*.",
      }),
      b("image", {
        src: img("tandai-ui", 1800, 1100),
        alt: "Tandai interface with margin annotations",
        caption: "Links on the left, marginalia on the right.",
      }),
      b("button", { label: "Try the beta", href: "https://example.com", variant: "pen" }),
    ],
  },
];

/* ── Journal ───────────────────────────────────────────── */

export const mockJournal: JournalPost[] = [
  {
    id: "j1",
    slug: "why-i-keep-a-public-archive",
    title: "Why I keep a public archive",
    excerpt:
      "Portfolios perform. Archives remember. Notes on choosing the second one and letting work stay unfinished in public.",
    cover_public_id: img("journal-archive", 1600, 900),
    status: "published",
    featured: true,
    reading_minutes: 4,
    published_at: "2026-02-02T00:00:00.000Z",
    tags: [tag("typography")],
    blocks: [
      b("paragraph", {
        text: "A portfolio is a stage. An archive is a desk drawer you let people open. I trust drawers more — the half-finished things tell you how someone actually works.",
      }),
      b("heading", { level: 2, text: "The garden, not the gallery" }),
      b("markdown", {
        md: "Three rules I'm trying to follow:\n\n1. **Publish at 80%.** The last 20% is where honesty dies.\n2. **Date everything.** Old opinions are allowed to be wrong.\n3. **Link generously.** A note that links nowhere is a dead end, not a garden.",
      }),
      b("quote", { text: "The work you hide teaches no one — including you.", source: "" }),
    ],
  },
  {
    id: "j2",
    slug: "color-as-stationery",
    title: "Color as stationery",
    excerpt:
      "Yellow is a highlighter, blue is a pen, red is the teacher's margin. Designing a palette by giving each color a job.",
    cover_public_id: img("journal-color", 1600, 900),
    status: "published",
    featured: false,
    reading_minutes: 3,
    published_at: "2026-01-18T00:00:00.000Z",
    tags: [tag("ui")],
    blocks: [
      b("paragraph", {
        text: "Most palettes fail because every color wants to be the lead singer. Stationery solved this decades ago: the highlighter marks, the pen writes, the red pen corrects. Nobody fights.",
      }),
      b("paragraph", {
        text: "This site runs on that contract. Yellow only touches what's featured or active. Blue carries every link and primary action. Red shows up rarely — emphasis and errors — which is exactly why you notice it.",
      }),
    ],
  },
  {
    id: "j3",
    slug: "editing-is-listening",
    title: "Editing is listening",
    excerpt: "What six evenings in a warung taught me about cutting footage: the edit was already in the room.",
    cover_public_id: img("journal-edit", 1600, 900),
    status: "published",
    featured: false,
    reading_minutes: 5,
    published_at: "2025-07-08T00:00:00.000Z",
    tags: [tag("video")],
    blocks: [
      b("paragraph", {
        text: "I used to edit by imposing structure. Warung Side A flipped that: the place already had a rhythm — kettle, ladle, gossip, motorbike — and the cut just had to stop interrupting it.",
      }),
      b("youtube", { youtube_id: "dQw4w9WgXcQ", caption: "The two-minute sequence where I finally got out of the way." }),
    ],
  },
  {
    id: "j4",
    slug: "tools-i-actually-open",
    title: "Tools I actually open",
    excerpt: "An honest inventory: the tools that survived a year of daily work, and the shiny ones that didn't.",
    cover_public_id: img("journal-tools", 1600, 900),
    status: "published",
    featured: false,
    reading_minutes: 3,
    published_at: "2025-11-23T00:00:00.000Z",
    tags: [tag("creative-coding")],
    blocks: [
      b("markdown", {
        md: "**Survived:** Figma, VS Code, DaVinci Resolve, a paper notebook, Arc.\n\n**Didn't:** four note-taking apps, two task managers, and every AI tool that promised to 'organize my life'.\n\nThe pattern is embarrassing in its simplicity: tools that hold *artifacts* survive, tools that hold *intentions* don't.",
      }),
    ],
  },
];

/* ── Pages ─────────────────────────────────────────────── */

export const mockPages: PageRow[] = [
  {
    id: "pg-home",
    slug: "home",
    title: "Home",
    data: {
      intro:
        "A creative technologist working between design, media, and code — this is my living archive, not a portfolio.",
      journal_hook: "How I think, in public →",
    },
  },
  {
    id: "pg-about",
    slug: "about",
    title: "About",
    data: {
      portrait: img("hilman-portrait", 900, 1100),
      lede: "I'm Hilman — a creative technologist from Indonesia who never managed to pick one lane, and eventually realized the lane *was* the problem.",
      story: [
        "I started in design because I loved how a grid could calm a messy idea. Then video, because some ideas refuse to sit still. Then code, because I got tired of asking permission to build the things I imagined.",
        "Now the three feed each other. Design teaches my code restraint. Code gives my stories new containers. Stories remind my design who it's for.",
        "This site is where all of it lives — finished work, half-formed notes, and experiments that may never grow up. You're welcome to wander.",
      ],
      timeline: [
        { year: "2020", text: "First paid poster. Printed it slightly wrong. Client loved it." },
        { year: "2022", text: "Picked up a camera seriously; spent a year filming small businesses." },
        { year: "2023", text: "Learned to code out of spite. Stayed out of love." },
        { year: "2025", text: "Started merging all three into one practice — and this archive." },
      ],
      toolbox: ["Figma", "Illustrator", "Premiere Pro", "DaVinci Resolve", "Next.js", "TypeScript", "Supabase", "A paper notebook"],
      currently: [
        "Building small tools for personal archiving",
        "Shooting a follow-up to Warung Side A",
        "Reading about vernacular signage",
      ],
    },
  },
  {
    id: "pg-connect",
    slug: "connect",
    title: "Connect",
    data: {
      lede: "Got a project, a question, or just a good link to share? My inbox is friendlier than this form looks.",
      availability: "Open for select freelance work and collaborations — especially ones that mix at least two of: design, film, code.",
      note: "I reply to everything that isn't a crypto pitch. Usually within two days.",
    },
  },
];
