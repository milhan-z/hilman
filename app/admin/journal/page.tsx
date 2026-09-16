import { createServerSupabase } from "@/lib/supabase/server";
import { JournalDirectory } from "@/components/admin/journal-directory";
import { QueryError } from "@/components/admin/query-error";

export const metadata = {
  title: "Journal — Studio",
};

export default async function AdminJournalPage() {
  const supabase = await createServerSupabase();
  const { data: posts, error } = await supabase
    .from("journal_posts")
    .select("id, title, slug, status, featured, published_at, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="max-w-6xl space-y-5">
      <QueryError what="the journal list" error={error?.message} />
      <JournalDirectory initialPosts={posts ?? []} />
    </div>
  );
}
