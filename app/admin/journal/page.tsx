import { createServerSupabase } from "@/lib/supabase/server";
import { JournalDirectory } from "@/components/admin/journal-directory";

export const metadata = {
  title: "Journal — Studio",
};

export default async function AdminJournalPage() {
  const supabase = createServerSupabase();
  const { data: posts } = await supabase
    .from("journal_posts")
    .select("id, title, slug, status, featured, published_at, updated_at")
    .order("updated_at", { ascending: false });

  return (
    <div className="max-w-6xl">
      <JournalDirectory initialPosts={posts ?? []} />
    </div>
  );
}
