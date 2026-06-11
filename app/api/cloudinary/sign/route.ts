import { NextResponse } from "next/server";
import { CLOUDINARY, cloudinaryServerConfigured, signParams } from "@/lib/cloudinary-server";
import { createServerSupabase } from "@/lib/supabase/server";
import { supabaseConfigured } from "@/lib/supabase/config";

/**
 * Signed Cloudinary upload (admin-only).
 * The client POSTs { folder } and receives signed params it can send
 * straight to Cloudinary's upload endpoint. No unsigned presets.
 */
export async function POST(request: Request) {
  if (!supabaseConfigured) {
    return NextResponse.json({ error: "Supabase not configured" }, { status: 503 });
  }
  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!cloudinaryServerConfigured) {
    return NextResponse.json({ error: "Cloudinary not configured" }, { status: 503 });
  }

  const { folder = "hilman" } = await request.json().catch(() => ({}));
  const timestamp = Math.floor(Date.now() / 1000);
  const params: Record<string, string | number> = { folder, timestamp };
  const signature = signParams(params);

  return NextResponse.json({
    cloudName: CLOUDINARY.cloudName,
    apiKey: CLOUDINARY.apiKey,
    timestamp,
    folder,
    signature,
  });
}
