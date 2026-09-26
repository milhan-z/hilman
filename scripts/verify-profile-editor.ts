import assert from "node:assert/strict";
import { cleanPageData, PAGE_SCHEMAS, readField } from "../components/admin/page-schemas";
import { mockPages } from "../lib/mock";
import { PROFILE_DEFAULTS, resolveProfileData } from "../lib/profile";

function fieldsFor(slug: string, data: Record<string, any>) {
  return Object.fromEntries(PAGE_SCHEMAS[slug].fields.map((field) => [field.key, readField(data, field)]));
}

for (const slug of ["home", "about", "connect"]) {
  const stored = mockPages.find((page) => page.slug === slug)!.data;
  const untouched = JSON.stringify(stored);
  const displayed = resolveProfileData(slug, stored);
  const saved = cleanPageData(PAGE_SCHEMAS[slug], fieldsFor(slug, displayed), stored, Object.keys(PROFILE_DEFAULTS[slug]));
  const reloaded = resolveProfileData(slug, saved);

  for (const field of PAGE_SCHEMAS[slug].fields) {
    assert.deepEqual(readField(reloaded, field), readField(displayed, field), `${slug}.${field.key} changed after saving and reopening`);
  }
  assert.equal(JSON.stringify(stored), untouched, `${slug}: editing mutated the original stored data`);
}

const aboutSeed = mockPages.find((page) => page.slug === "about")!.data;
const reorderedTimeline = aboutSeed.timeline.map((item: { year: string; text: string }) => ({ text: item.text, year: item.year }));
const resolvedSeed = resolveProfileData("about", { timeline: reorderedTimeline, story: aboutSeed.story, lede: aboutSeed.lede });
assert.deepEqual(resolvedSeed.timeline, PROFILE_DEFAULTS.about.timeline, "An unchanged seed timeline with JSONB-reordered object keys must give way to the verified one");
assert.deepEqual(resolvedSeed.story, PROFILE_DEFAULTS.about.story, "Unchanged seed copy must still resolve to verified profile copy");
assert.equal(resolvedSeed.lede, PROFILE_DEFAULTS.about.lede, "An unchanged seed string must still resolve to verified profile copy");
const editedTimeline = reorderedTimeline.map((item: { year: string; text: string }, index: number) => index === 0 ? { ...item, text: "My actual experience" } : item);
assert.deepEqual(resolveProfileData("about", { timeline: editedTimeline }).timeline, editedTimeline, "A custom timeline must survive regardless of object key ordering");

const custom = {
  lede: "My own introduction",
  portrait: "hilman/a-real-photo",
  story: ["My own story."],
  toolbox: ["A tool I actually use"],
  private_editor_metadata: { source: "kept verbatim" },
};
const about = resolveProfileData("about", custom);
assert.equal(about.lede, custom.lede, "An unchanged custom string must be preserved");
const cleared = {
  ...fieldsFor("about", about),
  lede: "   ",
  interests: [],
  personal_note: "",
  portrait: "",
  moments: [{ title: "", image: "", alt: "", caption: "" }],
};
const saved = cleanPageData(PAGE_SCHEMAS.about, cleared, custom, Object.keys(PROFILE_DEFAULTS.about));
const reopened = resolveProfileData("about", saved);
assert.equal(reopened.lede, "", "A cleared defaulted scalar must stay hidden");
assert.equal(reopened.personal_note, "", "A cleared defaulted note must stay hidden");
assert.deepEqual(reopened.interests, [], "A cleared defaulted list must stay hidden");
assert.deepEqual(reopened.story, custom.story, "Custom biography must survive");
assert.deepEqual(reopened.toolbox, custom.toolbox, "Custom tools must survive");
assert.deepEqual(saved.private_editor_metadata, custom.private_editor_metadata, "Unknown CMS fields must survive untouched");
assert.equal("portrait" in saved, false, "An optional removed photo must be removed");
assert.equal("moments" in saved, false, "An empty optional memory must be omitted");

console.log("Profile editor checks passed: JSONB key ordering, public/editor parity, custom content, explicit clears, optional fields, and source preservation.");
