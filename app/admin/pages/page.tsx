import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AdminPagesPage() {
  const supabase = createServerSupabase();
  const { data: pages } = await supabase.from("pages").select("slug, title, updated_at").order("slug");

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-bold">Pages</h1>
      <p className="mt-1 text-sm text-soft">
        Structured content for Home, About, Connect, and the Desk.
      </p>
      <ul className="mt-6 divide-y divide-line rounded-lg border border-line bg-surface">
        {(pages ?? []).map((p) => (
          <li key={p.slug}>
            <Link href={`/admin/pages/${p.slug}`} className="flex items-center justify-between px-4 py-3.5 text-sm hover:bg-n-100">
              <span className="font-medium">{p.title}</span>
              <span className="text-xs text-faint">/{p.slug === "home" ? "" : p.slug}</span>
            </Link>
          </li>
        ))}
        {(pages ?? []).length === 0 && (
          <li className="px-4 py-8 text-center text-sm text-faint">
            No pages yet — run <code>npm run seed</code> to create the defaults.
          </li>
        )}
      </ul>
    </div>
  );
}
