/**
 * Manage who owns this site.
 *
 *   npm run owner              → list the current owners
 *   npm run owner -- add you@example.com
 *   npm run owner -- remove someone@example.com
 *
 * Ownership lives in the `site_owners` table, which has RLS enabled and no
 * policies at all — the app cannot read or change it. Only this script (using
 * the service-role key) and the Supabase SQL editor can.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const sb = createClient(url, serviceKey, { auth: { persistSession: false } });

async function findUserByEmail(email: string) {
  // The admin listing is paginated; a personal project never has many users.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

async function list() {
  const { data, error } = await sb.from("site_owners").select("user_id, note, added_at");
  if (error) {
    if (error.code === "42P01") {
      console.error(
        "The site_owners table doesn't exist yet. Apply supabase/migrations/0003_owner_and_integrity.sql first."
      );
      process.exit(1);
    }
    throw new Error(error.message);
  }
  if (!data?.length) {
    console.log("No owners yet — nobody can edit the site.");
    console.log("Add yourself:  npm run owner -- add you@example.com");
    return;
  }
  const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 200 });
  const emailById = new Map((users?.users ?? []).map((u) => [u.id, u.email ?? "(no email)"]));
  console.log(`${data.length} owner${data.length > 1 ? "s" : ""}:`);
  for (const row of data) {
    console.log(`  • ${emailById.get(row.user_id) ?? row.user_id}  (added ${row.added_at})`);
  }
}

async function add(email: string) {
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(
      `No account found for ${email}. Create it in Supabase → Authentication → Users first.`
    );
    process.exit(1);
  }
  const { error } = await sb
    .from("site_owners")
    .upsert({ user_id: user.id, note: `added via npm run owner` }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
  console.log(`✓ ${email} can now administer the site.`);
}

async function remove(email: string) {
  const user = await findUserByEmail(email);
  if (!user) {
    console.error(`No account found for ${email}.`);
    process.exit(1);
  }
  const { count } = await sb.from("site_owners").select("user_id", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    console.error("Refusing to remove the last owner — you would lock yourself out.");
    process.exit(1);
  }
  const { error } = await sb.from("site_owners").delete().eq("user_id", user.id);
  if (error) throw new Error(error.message);
  console.log(`✓ ${email} can no longer administer the site.`);
}

async function run() {
  const [command, email] = process.argv.slice(2);
  if (!command || command === "list") return list();
  if (!email) {
    console.error(`Usage: npm run owner -- ${command} you@example.com`);
    process.exit(1);
  }
  if (command === "add") return add(email);
  if (command === "remove") return remove(email);
  console.error(`Unknown command "${command}". Use list, add, or remove.`);
  process.exit(1);
}

run().catch((e) => {
  console.error(e.message ?? e);
  process.exit(1);
});
