import { createCategory, createTag, deleteCategory, deleteTag } from "../actions";
import { createServerSupabase } from "@/lib/supabase/server";
import { STREAMS } from "@/lib/types";

export default async function AdminTaxonomyPage() {
  const supabase = await createServerSupabase();
  const [{ data: tags }, { data: categories }] = await Promise.all([
    supabase.from("tags").select("*").order("name"),
    supabase.from("categories").select("*").order("sort_order"),
  ]);

  return (
    <div className="max-w-3xl space-y-12">
      <section>
        <h1 className="font-display text-2xl font-bold">Tags</h1>
        <form action={createTag} className="mt-4 flex gap-2">
          <input
            name="name"
            required
            placeholder="New tag name"
            className="min-h-12 w-64 max-w-full rounded border border-line bg-raise px-3.5 py-2.5 text-base outline-none focus:border-pen"
          />
          <button className="min-h-12 rounded bg-hl px-4 text-sm font-medium text-hl-ink hover:opacity-90">Add</button>
        </form>
        <ul className="mt-4 flex flex-wrap gap-2">
          {(tags ?? []).map((t) => (
            <li key={t.id} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-3 pr-1 text-sm">
              {t.name}
              <form
                action={async () => {
                  "use server";
                  await deleteTag(t.id);
                }}
              >
                <button aria-label={`Delete tag ${t.name}`} className="flex h-6 w-6 items-center justify-center rounded-full text-faint hover:bg-red-soft hover:text-red">
                  ✕
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold">Categories</h2>
        <form action={createCategory} className="mt-4 flex flex-wrap gap-2">
          <input
            name="name"
            required
            placeholder="Category name"
            className="min-h-12 w-56 max-w-full rounded border border-line bg-raise px-3.5 py-2.5 text-base outline-none focus:border-pen"
          />
          <select name="stream" className="min-h-12 rounded border border-line bg-raise px-3 py-2.5 text-base outline-none focus:border-pen">
            <option value="">No stream</option>
            {Object.entries(STREAMS).map(([key, s]) => (
              <option key={key} value={key}>{s.name}</option>
            ))}
          </select>
          <input
            name="description"
            placeholder="Description (optional)"
            className="min-h-12 w-64 max-w-full rounded border border-line bg-raise px-3.5 py-2.5 text-base outline-none focus:border-pen"
          />
          <button className="min-h-12 rounded bg-hl px-4 text-sm font-medium text-hl-ink hover:opacity-90">Add</button>
        </form>
        <ul className="mt-4 divide-y divide-line rounded-lg border border-line bg-surface">
          {(categories ?? []).map((c) => (
            <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="flex-1 font-medium">{c.name}</span>
              <span className="text-xs text-faint">{c.stream ?? "—"}</span>
              <form
                action={async () => {
                  "use server";
                  await deleteCategory(c.id);
                }}
              >
                <button aria-label={`Delete category ${c.name}`} className="text-faint hover:text-red">✕</button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
