import { mockJournal, mockProjects, mockSettings } from "./mock";
import type { Block, JournalPost, Project, Settings } from "./types";

export interface ContentQualityIssue {
  code: "demo" | "template" | "placeholder-link" | "test-text";
  message: string;
}

/** Accepts both database rows and unsaved CMS form payloads. */
export interface ContentQualityInput {
  title?: string;
  subtitle?: string | null;
  excerpt?: string | null;
  stream?: string;
  year?: string | number | null;
  thumbnail_public_id?: string | null;
  cover_public_id?: string | null;
  meta?: Record<string, any>;
  blocks?: Pick<Block, "type" | "data">[];
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, val]) => `${JSON.stringify(key)}:${stable(val)}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/** IDs, timestamps, sorting, and slug are not proof that demo copy was rewritten. */
function fingerprint(content: ContentQualityInput, kind: "project" | "journal") {
  return stable({
    title: content.title ?? "",
    excerpt: content.excerpt ?? "",
    cover: content.cover_public_id ?? "",
    blocks: (content.blocks ?? []).map(({ type, data }) => ({ type, data })),
    ...(kind === "project" ? {
      subtitle: content.subtitle ?? "",
      stream: content.stream ?? "",
      year: content.year ? Number(content.year) : null,
      thumbnail: content.thumbnail_public_id ?? "",
      meta: content.meta ?? {},
    } : {}),
  });
}

const projectDemos = new Set(mockProjects.map((item) => fingerprint(item, "project")));
const journalDemos = new Set(mockJournal.map((item) => fingerprint(item, "journal")));

function narrative(content: ContentQualityInput): string[] {
  return (content.blocks ?? []).flatMap((block) => {
    const text = block.type === "paragraph" ? block.data?.text : block.type === "markdown" ? block.data?.md : null;
    return typeof text === "string" && text.trim() ? [text.trim()] : [];
  });
}

/** Adding a gallery/video or layout metadata cannot turn unchanged fictional
 * claims into a personal case study. Rewritten prose with the same slug is fine. */
function retainsDemoNarrative(content: ContentQualityInput, demos: ContentQualityInput[]): boolean {
  const text = new Set(narrative(content));
  return demos.some((demo) => {
    if (content.title !== demo.title || content.excerpt !== demo.excerpt) return false;
    const seededText = narrative(demo);
    return seededText.length > 0 && seededText.every((paragraph) => text.has(paragraph));
  });
}

// Exact author prompts from the CMS starter layouts. Ordinary short notes and
// questions are allowed; only known, unchanged instructions are screened.
const templatePrompts = new Set([
  "What was the situation, and what needed to change? One paragraph, no jargon.",
  "What was your part? Name what you did yourself and what the rest of the team did — a reader can't tell otherwise.",
  "What came out of it? If there are no numbers, describe the concrete result and what you'd do differently. Don't invent impact figures.",
  "Two or three choices that shaped the result — and the constraint behind each one.",
  "What decision does this image show?",
  "Who or what is this about, and why did it deserve filming?",
  "Shooting conditions, the constraint you worked around, the choice you made in the edit.",
  "Frame or still — say what it shows.",
  "One paragraph a non-engineer can follow. Save the stack list for below.",
  "A screenshot of the thing working.",
  "The one design decision worth explaining — and what it cost.",
  "// The smallest piece of code that shows the idea.",
  "What prompted this note?",
  "The observation, while it is still specific.",
  "The next experiment, so future you has a starting point.",
]);

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (value && typeof value === "object") return Object.values(value).flatMap(strings);
  return [];
}

function sharedIssues(content: ContentQualityInput): ContentQualityIssue[] {
  const issues: ContentQualityIssue[] = [];
  const blockStrings = (content.blocks ?? []).flatMap((block) => strings(block.data));
  if (blockStrings.some((text) => templatePrompts.has(text.trim()))) {
    issues.push({ code: "template", message: "Replace the remaining starter-template instructions with your own story before publishing." });
  }
  // Restrict detection to URLs and the demo video ID, never ordinary prose
  // mentioning example.com or discussing a video.
  const urls = [
    ...(Array.isArray(content.meta?.links) ? content.meta.links : []).map((link: { url?: string } | null) => link?.url ?? ""),
    ...(content.blocks ?? []).flatMap((block) => [block.data?.url, block.data?.href, block.type === "youtube" ? block.data?.youtube_id : ""]),
  ];
  if (urls.some((url) => typeof url === "string" && (/^https?:\/\/(www\.)?example\.(com|org|net)([/?#]|$)/i.test(url.trim()) || url.includes("dQw4w9WgXcQ")))) {
    issues.push({ code: "placeholder-link", message: "Replace the demo link or sample video with the real project destination before publishing." });
  }
  const prose = [content.excerpt ?? "", ...(content.blocks ?? []).filter((block) => block.type === "paragraph" || block.type === "markdown").map((block) => String(block.data?.text ?? block.data?.md ?? ""))];
  if (prose.some((text) => /(?:Everyone\s+jnafndaj\s*){3,}/i.test(text) || /^(?:test|testing|tes|asdf|asdasd|qwerty){8,}$/i.test(text.replace(/\s+/g, "")))) {
    issues.push({ code: "test-text", message: "Replace the repeated test text before publishing." });
  }
  return issues;
}

export function getProjectQualityIssues(content: ContentQualityInput): ContentQualityIssue[] {
  const issues = sharedIssues(content);
  if (projectDemos.has(fingerprint(content, "project")) || retainsDemoNarrative(content, mockProjects)) {
    issues.unshift({ code: "demo", message: "This is an unchanged demo project. Replace it with your own work before publishing." });
  }
  return issues;
}

export function getJournalQualityIssues(content: ContentQualityInput): ContentQualityIssue[] {
  const issues = sharedIssues(content);
  if (journalDemos.has(fingerprint(content, "journal")) || retainsDemoNarrative(content, mockJournal)) {
    issues.unshift({ code: "demo", message: "This is an unchanged demo entry. Replace it with your own writing before publishing." });
  }
  return issues;
}

export const isPublicProject = (project: Project) => project.status === "published" && getProjectQualityIssues(project).length === 0;
export const isPublicJournalPost = (post: JournalPost) => post.status === "published" && getJournalQualityIssues(post).length === 0;

/** Keep custom links; remove only the exact unverified URLs shipped in the seed. */
export function sanitizePublicSettings(settings: Settings): Settings {
  const demoUrls = new Set(mockSettings.socials.map((social) => social.url));
  return { ...settings, socials: settings.socials.filter((social) => !demoUrls.has(social.url)) };
}
