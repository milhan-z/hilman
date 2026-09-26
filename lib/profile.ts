import { mockPages } from "./mock";

/** Personal copy is based on Hilman's own brief. No invented clients, dates or outcomes. */
export const PROFILE_DEFAULTS: Record<string, Record<string, any>> = {
  home: {
    headline: "A curious mind.\nA little bit of everything.",
    intro: "Hi, I’m Hilman. I study Informatics at ITS and explore ideas through design, film, photography, motion, and code. This is my little corner of the internet — come have a look around.",
    note: "Made of ideas, experiments & people.",
    field: "Design · Media · Code",
    journal_hook: "Read the notes",
  },
  about: {
    // The studio portrait, background removed and given a paper edge
    // (Cloudinary; the plain cut-out is hilman/about-portrait-cutout).
    portrait_cutout: "hilman/about-portrait-sticker",
    portrait_alt: "Hilman standing with his hands in his pockets, in a white shirt, black trousers and white sneakers.",
    // The page's heading already says "Hi, I’m Hilman." — the lede carries on from it.
    lede: "An Informatics student at ITS, with a soft spot for the creative side of things.",
    story: [
      "My days move between graphic design, video editing, motion, photography, and code. I like exploring how they can work together — an idea might become an image, a moving story, or something you can actually interact with.",
      "This notebook brings those parts of me together. The things I make, the thinking behind them, and the little discoveries I want to keep.",
    ],
    focus: ["Graphic design & visual communication", "Video editing & motion", "Photography & storytelling", "Web & creative coding"],
    interests: ["Design", "Film & photo", "Motion", "Code", "Meeting people"],
    // Beside the cut-out, pointing at it. (It used to repeat the kicker of
    // the people section below, word for word.)
    personal_note: "hi, that’s me!",
    community_heading: "Good things happen together.",
    community_story: "Through organisations and ITS Global Engagement, I get to meet people, collaborate, and share experiences. Those connections matter to me just as much as the things we make.",
    // Only what the site itself shows to be true: the brief above, and the
    // work published here (Hilman Studio, 2026). No invented years.
    timeline: [
      { year: "Now", text: "Studying Informatics at ITS, and bringing design, video and photography into the same projects as code." },
      { year: "2026", text: "Built Hilman Studio: this notebook, and the small publishing system behind it." },
      { year: "Along the way", text: "Organisations and ITS Global Engagement: new people, collaborations and shared experiences." },
    ],
    currently: [
      "Filling this notebook with the things I’ve made so far",
      "Writing down the process behind each piece, not just the result",
      "Looking for projects, and people, to make things with",
    ],
    // The stack this notebook is built with (see the Hilman Studio project).
    toolbox: ["Next.js", "TypeScript", "Tailwind CSS", "Supabase", "Cloudinary", "Cloudflare R2", "Vercel"],
  },
  connect: {
    lede: "Have an idea in mind, a role that sounds like me, or something you’d love to make together? I’d like to hear about it.",
    availability: "Let’s talk about creative projects, tech, and collaborations — or simply get to know each other.",
    note: "A small hello is a good place to start.",
  },
};

/** JSONB can reorder object keys; content equality must not depend on their order. */
function sameContent(left: unknown, right: unknown): boolean {
  if (left === right) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return Array.isArray(left) && Array.isArray(right) && left.length === right.length
      && left.every((item, index) => sameContent(item, right[index]));
  }
  if (!left || !right || typeof left !== "object" || typeof right !== "object") return false;
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const keys = Object.keys(leftRecord);
  return keys.length === Object.keys(rightRecord).length
    && keys.every((key) => Object.prototype.hasOwnProperty.call(rightRecord, key)
      && sameContent(leftRecord[key], rightRecord[key]));
}

/** Replace only unchanged seed fields. Custom CMS content always takes precedence.
 * No database writes: the original content remains available in Studio.
 */
export function resolveProfileData(slug: string, data: Record<string, any> = {}): Record<string, any> {
  const defaults = PROFILE_DEFAULTS[slug];
  if (!defaults) return data;
  const seed = mockPages.find((page) => page.slug === slug)?.data ?? {};
  const result = { ...defaults };
  for (const [key, value] of Object.entries(data)) {
    if (key in seed && sameContent(value, seed[key])) continue;
    result[key] = value;
  }
  return result;
}
