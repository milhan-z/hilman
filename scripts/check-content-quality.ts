import assert from "node:assert/strict";
import { getJournalQualityIssues, getProjectQualityIssues, isPublicJournalPost, isPublicProject, sanitizePublicSettings } from "../lib/content-quality";
import { mockJournal, mockProjects, mockSettings } from "../lib/mock";
import { resolveProfileData } from "../lib/profile";
import type { Block, JournalPost, Project } from "../lib/types";

const paragraph = (text: string): Block => ({ id: "actual-block", position: 0, type: "paragraph", data: { text } });

assert.equal(mockProjects.filter(isPublicProject).length, 0, "All six unchanged demo projects must be excluded");
assert.equal(mockJournal.filter(isPublicJournalPost).length, 0, "All unchanged demo entries must be excluded");
const reseeded = { ...mockProjects[0], id: "new-db-id", slug: "another-slug", blocks: mockProjects[0].blocks!.map((block, position) => ({ ...block, id: String(position), position })) };
assert.ok(getProjectQualityIssues(reseeded).some((issue) => issue.code === "demo"), "Database IDs and slug changes do not make demo content authentic");
const appendedEmbed: Project = { ...mockProjects[3], blocks: [...mockProjects[3].blocks!, { id: "extra", position: 100, type: "youtube", data: { youtube_id: "RaLOpzSAlPw" } }] };
assert.equal(isPublicProject(appendedEmbed), false, "Appending a real video does not republish unchanged seeded claims");
const layoutEdited: Project = { ...appendedEmbed, blocks: appendedEmbed.blocks!.map((block) => ({ ...block, data: { ...block.data, width: "wide" } })) };
assert.equal(isPublicProject(layoutEdited), false, "Changing block layout does not republish unchanged seeded claims");

const realProject: Project = {
  ...mockProjects[0], title: "My first campus poster", subtitle: "A student design exercise", excerpt: "Exploring a clearer hierarchy for our announcement.",
  thumbnail_public_id: null, cover_public_id: null, meta: { role: "Layout", tools: ["Figma"] },
  blocks: [paragraph("I tested two layouts and chose the one that made the event date easier to find.")],
};
assert.ok(isPublicProject(realProject), "Rewritten content is allowed even when it keeps a demo slug");
assert.equal(isPublicProject({ ...realProject, status: "draft" }), false, "Drafts stay private");

const shortNote: JournalPost = {
  ...mockJournal[0], title: "A small observation", excerpt: "I liked how the light crossed our workspace today.", cover_public_id: null,
  blocks: [paragraph("I liked how the light crossed our workspace today.")],
};
assert.ok(isPublicJournalPost(shortNote), "Genuine short notes are publishable without arbitrary length thresholds");
assert.equal(isPublicJournalPost({ ...shortNote, blocks: [paragraph("What prompted this note?")] }), false, "Unedited author prompts must not be published");
assert.ok(getJournalQualityIssues({ ...shortNote, excerpt: "Everyone jnafndaj".repeat(9) }).some((issue) => issue.code === "test-text"), "The confirmed repeated test excerpt is screened");
assert.ok(isPublicJournalPost({ ...shortNote, blocks: [paragraph("What happened today? I made something with friends.")] }), "Ordinary questions are not template prompts");
assert.ok(getProjectQualityIssues({ ...realProject, meta: { links: [{ label: "Demo", url: "https://example.com" }] } }).some((issue) => issue.code === "placeholder-link"), "Sample project links must be replaced");
const sampleVideo: Block = { id: "video", position: 0, type: "youtube", data: { youtube_id: "dQw4w9WgXcQ" } };
assert.ok(getProjectQualityIssues({ ...realProject, blocks: [sampleVideo] }).some((issue) => issue.code === "placeholder-link"), "The known sample video must be replaced");
assert.ok(isPublicProject({ ...realProject, blocks: [paragraph("I used example.com in a code example.")] }), "An ordinary mention of a documentation domain is allowed");

const personalLink = { label: "My portfolio", url: "https://my-own-portfolio.test" };
assert.deepEqual(sanitizePublicSettings({ ...mockSettings, socials: [...mockSettings.socials, personalLink] }).socials, [personalLink]);
const customIntro = "A personal introduction I wrote myself.";
assert.equal(resolveProfileData("home", { intro: customIntro }).intro, customIntro, "Custom CMS profile content survives normalization");
console.log("Content quality checks passed: demos, rewritten slugs, short notes, templates, confirmed test text, links, settings, and custom profile content.");
