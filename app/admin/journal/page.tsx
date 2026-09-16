import { createServerSupabase } from "@/lib/supabase/server";
import { JournalDirectory } from "@/components/admin/journal-directory";
import { QueryError } from "@/components/admin/query-error";
import { findHiddenPublished } from "@/lib/studio-visibility";

export const metadata = {
  title: "Journal — Studio",
};

export default async function AdminJournalPage() {
  const supabase = await createServerSupabase();
  // Selecting everything so the public-visibility check sees the same content
  // the public reads do; the list itself is mapped down before it crosses to
  // the client.
  const { data: posts, error } = await supabase
    .from("journal_posts")
    .select("*")
    .order("updated_at", { ascending: false });

  const hidden = await findHiddenPublished("journal", posts ?? []);

  return (
    <div className="max-w-6xl space-y-5">
      <QueryError what="the journal list" error={error?.message} />
      <JournalDirectory
        initialPosts={(posts ?? []).map((post) => ({
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          featured: post.featured,
          published_at: post.published_at,
          updated_at: post.updated_at,
          hiddenReasons: hidden.get(post.id),
        }))}
      />
    </div>
  );
}
