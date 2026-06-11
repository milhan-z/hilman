import { MediaLibrary } from "@/components/admin/media-library";
import { cloudinaryServerConfigured } from "@/lib/cloudinary-server";
import { createServerSupabase } from "@/lib/supabase/server";
import type { MediaRow } from "@/lib/types";

export default async function AdminMediaPage() {
  const supabase = createServerSupabase();
  const { data: media } = await supabase
    .from("media")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <div className="max-w-5xl">
      <h1 className="font-display text-2xl font-bold">Media library</h1>
      <p className="mt-1 text-sm text-soft">
        Upload to Cloudinary (signed, server-side), set alt text, copy ids into blocks.
      </p>
      {!cloudinaryServerConfigured && (
        <p className="mt-4 rounded border border-hl bg-hl-soft px-4 py-3 text-sm">
          Cloudinary env vars are missing — uploads are disabled until{" "}
          <code>NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME</code>, <code>CLOUDINARY_API_KEY</code> and{" "}
          <code>CLOUDINARY_API_SECRET</code> are set.
        </p>
      )}
      <div className="mt-6">
        <MediaLibrary media={(media as MediaRow[]) ?? []} />
      </div>
    </div>
  );
}
