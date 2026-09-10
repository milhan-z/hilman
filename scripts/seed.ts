/**
 * Replace all content with the demo material from lib/mock.ts.
 *
 *   npm run seed -- --force
 *
 * THIS IS DESTRUCTIVE. It deletes every project, journal entry, page, tag,
 * category and setting before inserting fictional examples. It exists to fill
 * an empty development database, and nothing else.
 *
 * If you only need the Home / About / Connect page rows, do not use this:
 * open Studio -> Pages and press "Create missing pages", which adds the
 * missing rows and leaves your content alone.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";
import {
  mockCategories,
  mockJournal,
  mockPages,
  mockProjects,
  mockSettings,
  mockTags,
} from "../lib/mock";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

const forced = process.argv.includes("--force");

/** Refuses to run against a database that already holds real content. */
async function guard() {
  if (forced) return;

  const [projects, journal, pages] = await Promise.all([
    sb.from("projects").select("id", { count: "exact", head: true }),
    sb.from("journal_posts").select("id", { count: "exact", head: true }),
    sb.from("pages").select("id", { count: "exact", head: true }),
  ]);
  const total = (projects.count ?? 0) + (journal.count ?? 0) + (pages.count ?? 0);

  if (total > 0) {
    console.error(
      [
        "",
        "Refusing to seed: this database already has content.",
        "  projects: " + (projects.count ?? 0) +
          "   journal: " + (journal.count ?? 0) +
          "   pages: " + (pages.count ?? 0),
        "",
        "Seeding DELETES all of it and inserts demo material instead.",
        "",
        "  - To add only the missing Home/About/Connect rows, open",
        "    Studio > Pages and press \"Create missing pages\". Nothing is deleted.",
        "  - If you really do want to wipe this database, run:",
        "        npm run seed -- --force",
        "",
      ].join("\n")
    );
    process.exit(1);
  }
}

async function run() {
  await guard();
  console.log("→ clearing existing content…");
  for (const table of ["content_blocks", "projects", "journal_posts", "pages", "tags", "categories"]) {
    // join tables cascade from their parents
    const { error } = await sb
      .from(table)
      .delete()
      .neq("id", "00000000-0000-0000-0000-000000000000");
    if (error) throw new Error(`clearing ${table}: ${error.message}`);
  }
  {
    const { error } = await sb.from("settings").delete().neq("key", "");
    if (error) throw new Error(`clearing settings: ${error.message}`);
  }

  console.log("→ settings…");
  {
    const rows = Object.entries(mockSettings).map(([key, value]) => ({ key, value }));
    const { error } = await sb.from("settings").upsert(rows);
    if (error) throw error;
  }

  console.log("→ categories & tags…");
  const { error: catErr } = await sb
    .from("categories")
    .insert(mockCategories.map(({ id, ...rest }) => rest));
  if (catErr) throw catErr;

  const { data: tagRows, error: tagErr } = await sb
    .from("tags")
    .insert(mockTags.map(({ id, ...rest }) => rest))
    .select();
  if (tagErr) throw tagErr;
  const tagIdBySlug = new Map(tagRows!.map((t) => [t.slug, t.id]));

  console.log("→ projects…");
  for (const project of mockProjects) {
    const { id, tags, blocks, ...row } = project;
    const { data: inserted, error } = await sb.from("projects").insert(row).select().single();
    if (error) throw error;
    if (tags?.length) {
      const { error: jErr } = await sb.from("project_tags").insert(
        tags.map((t) => ({ project_id: inserted.id, tag_id: tagIdBySlug.get(t.slug) }))
      );
      if (jErr) throw jErr;
    }
    if (blocks?.length) {
      const { error: bErr } = await sb.from("content_blocks").insert(
        blocks.map((b, i) => ({
          owner_type: "project",
          owner_id: inserted.id,
          type: b.type,
          position: i,
          data: b.data,
        }))
      );
      if (bErr) throw bErr;
    }
    console.log(`   ✓ ${project.slug}`);
  }

  console.log("→ journal…");
  for (const post of mockJournal) {
    const { id, tags, blocks, ...row } = post;
    const { data: inserted, error } = await sb.from("journal_posts").insert(row).select().single();
    if (error) throw error;
    if (tags?.length) {
      const { error: jErr } = await sb.from("journal_tags").insert(
        tags.map((t) => ({ journal_id: inserted.id, tag_id: tagIdBySlug.get(t.slug) }))
      );
      if (jErr) throw jErr;
    }
    if (blocks?.length) {
      const { error: bErr } = await sb.from("content_blocks").insert(
        blocks.map((b, i) => ({
          owner_type: "journal",
          owner_id: inserted.id,
          type: b.type,
          position: i,
          data: b.data,
        }))
      );
      if (bErr) throw bErr;
    }
    console.log(`   ✓ ${post.slug}`);
  }

  console.log("→ pages…");
  for (const page of mockPages) {
    const { id, blocks, ...row } = page;
    const { error } = await sb.from("pages").insert(row);
    if (error) throw error;
    console.log(`   ✓ ${page.slug}`);
  }

  console.log("\nSeed complete. Open the site — it should feel alive.");
}

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
