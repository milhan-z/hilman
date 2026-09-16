import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { InitPagesButton } from "@/components/admin/init-pages-button";
import { PAGE_SCHEMAS } from "@/components/admin/page-schemas";

const PUBLIC_PATH: Record<string, string> = {
  home: "/",
  about: "/about",
  connect: "/connect",
};

export default async function AdminPagesPage() {
  const supabase = await createServerSupabase();
  const { data: pages, error } = await supabase
    .from("pages")
    .select("slug, title, updated_at")
    .order("slug");

  const rows = pages ?? [];
  const present = new Set(rows.map((p) => p.slug));
  const missing = Object.keys(PAGE_SCHEMAS).filter((slug) => !present.has(slug));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold">Pages</h1>
        <p className="mt-1 text-sm text-soft">
          The written parts of Home, About, and Connect — edited as forms, not JSON.
        </p>
      </div>

      {error && (
        <p role="alert" className="rounded border border-red/40 bg-red-soft/10 p-4 text-sm text-red">
          Could not read the page list: {error.message}
        </p>
      )}

      {!error && <InitPagesButton missing={missing} />}

      <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
        {rows.map((p) => (
          <li key={p.slug}>
            <Link
              href={`/admin/pages/${p.slug}`}
              className="flex items-center justify-between gap-3 px-4 py-3.5 text-sm hover:bg-n-100"
            >
              <span className="font-medium">{p.title}</span>
              <span className="font-mono text-xs text-soft">
                {PUBLIC_PATH[p.slug] ?? `/${p.slug}`}
              </span>
            </Link>
          </li>
        ))}
        {rows.length === 0 && !error && (
          <li className="px-4 py-8 text-center text-sm text-soft">
            No pages yet — use the button above to create the empty rows.
          </li>
        )}
      </ul>
    </div>
  );
}
