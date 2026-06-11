import { notFound } from "next/navigation";
import { PageEditor } from "@/components/admin/page-editor";
import { createServerSupabase } from "@/lib/supabase/server";

const HINTS: Record<string, string> = {
  home: 'Keys: "intro" (hero paragraph), "journal_hook" (link label).',
  about:
    'Keys: "lede", "story" (array of paragraphs), "timeline" ([{year,text}]), "toolbox" (array), "currently" (array), "portrait" (public_id/URL).',
  connect: 'Keys: "lede", "availability", "note".',
  desk:
    'Keys: "lede", "stickies" ([{color: yellow|blue|red, text}]), "folders" ([{label,href,count}]), "checklist" ([{text,done}]), "quick_links" ([{label,href}]), "now" ({listening,drinking}).',
};

export default async function PageEditorPage({ params }: { params: { slug: string } }) {
  const supabase = createServerSupabase();
  const { data: page } = await supabase.from("pages").select("*").eq("slug", params.slug).maybeSingle();
  if (!page) notFound();

  return (
    <div className="max-w-3xl">
      <h1 className="mb-6 font-display text-2xl font-bold">Edit page: {page.title}</h1>
      <PageEditor slug={page.slug} title={page.title} data={page.data} hint={HINTS[page.slug]} />
    </div>
  );
}
