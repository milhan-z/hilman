import { SettingsForm } from "@/components/admin/settings-form";
import { createServerSupabase } from "@/lib/supabase/server";
import { DEFAULT_SETTINGS, type Settings } from "@/lib/types";

export default async function AdminSettingsPage() {
  const supabase = createServerSupabase();
  const { data } = await supabase.from("settings").select("key, value");
  const map = Object.fromEntries((data ?? []).map((r) => [r.key, r.value]));
  const settings = { ...DEFAULT_SETTINGS, ...map } as Settings;

  return (
    <div>
      <h1 className="font-display text-2xl font-bold">Settings</h1>
      <p className="mt-1 text-sm text-soft">Hero roles, social links, and navigation.</p>
      <div className="mt-6">
        <SettingsForm settings={settings} />
      </div>
    </div>
  );
}
