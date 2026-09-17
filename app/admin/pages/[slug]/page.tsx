import Link from "next/link";
import { notFound } from "next/navigation";
import {
  RawPageDataEditor,
  StructuredPageEditor,
} from "@/components/admin/structured-page-editor";
import { InitPagesButton } from "@/components/admin/init-pages-button";
import { PAGE_SCHEMAS } from "@/components/admin/page-schemas";
import { createServerSupabase } from "@/lib/supabase/server";
import { PROFILE_DEFAULTS, resolveProfileData } from "@/lib/profile";

const PUBLIC_PATH: Record<string, string> = {
  home: "/",
  about: "/about",
  connect: "/connect",
};

export default async function PageEditorPage(props: { params: Promise<{ slug: string }> }) {
  const params = await props.params;
  const schema = PAGE_SCHEMAS[params.slug];
  const supabase = await createServerSupabase();
  const { data: page, error } = await supabase
    .from("pages")
    .select("*")
    .eq("slug", params.slug)
    .maybeSingle();

  if (error) {
    return (
      <div className="max-w-3xl">
        <h1 className="font-display text-2xl font-bold">Edit page</h1>
        <p role="alert" className="mt-4 rounded border border-red bg-red-soft p-4 text-sm text-red">
          Could not read this page: {error.message}
        </p>
      </div>
    );
  }

  // A missing row is not a missing route. Offer to create it instead of 404ing
  // into a dead end that points at a destructive seed script.
  if (!page) {
    if (!schema) notFound();
    return (
      <div className="max-w-3xl space-y-5">
        <h1 className="font-display text-2xl font-bold">{schema.title}</h1>
        <p className="text-sm text-soft">
          This page doesn&apos;t exist in the database yet.
        </p>
        <InitPagesButton missing={[params.slug]} />
        <Link href="/admin/pages" className="inline-block text-sm text-pen hover:underline">
          ← All pages
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
        <h1 className="font-display text-2xl font-bold">Edit page: {page.title}</h1>
        <Link href="/admin/pages" className="text-sm text-pen hover:underline">
          ← All pages
        </Link>
      </div>

      {schema ? (
        <StructuredPageEditor
          key={page.slug}
          schema={schema}
          title={page.title}
          data={page.data ?? {}}
          initialData={resolveProfileData(page.slug, page.data ?? {})}
          preserveEmptyFields={Object.keys(PROFILE_DEFAULTS[page.slug] ?? {})}
          previewHref={PUBLIC_PATH[page.slug]}
        />
      ) : (
        <RawPageDataEditor slug={page.slug} title={page.title} data={page.data ?? {}} />
      )}
    </div>
  );
}
