import { createServerSupabase } from "@/lib/supabase/server";
import { ContentDirectory } from "@/components/admin/content-directory";
import { QueryError } from "@/components/admin/query-error";
import { findHiddenPublished } from "@/lib/studio-visibility";
import { formatDate } from "@/lib/utils";

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
    <div className="space-y-5">
      <QueryError what="the journal list" error={error?.message} />
      <ContentDirectory
        kind="journal"
        title="Journal"
        newHref="/admin/journal/new"
        publicBase="/journal"
        searchPlaceholder="Search the journal"
        items={(posts ?? []).map((post) => ({
          id: post.id,
          title: post.title,
          slug: post.slug,
          status: post.status,
          featured: post.featured,
          meta:
            post.status === "published" && post.published_at
              ? formatDate(post.published_at)
              : `Edited ${formatDate(post.updated_at)}`,
          hiddenReasons: hidden.get(post.id),
        }))}
      />
    </div>
  );
}
