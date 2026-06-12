import type { Metadata } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/nav";
import { CommandPalette } from "@/components/admin/command-palette";
import { MobileTabs } from "@/components/admin/mobile-tabs";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { signOut } from "./actions";
import { MediaSelectorProvider } from "@/components/admin/media-library-context";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s — Hilman. Studio" },
  robots: { index: false, follow: false },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">Studio needs its keys</h1>
        <p className="mt-4 text-soft">
          The CMS requires Supabase. Add <code className="rounded bg-n-100 px-1.5">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
          <code className="rounded bg-n-100 px-1.5">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to{" "}
          <code className="rounded bg-n-100 px-1.5">.env.local</code>, run the migrations and seed,
          then come back. The public site keeps running on mock content meanwhile.
        </p>
        <Link href="/" className="mt-6 inline-block text-pen underline underline-offset-4">
          ← Back to the site
        </Link>
      </div>
    );
  }

  const supabase = createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // unauthenticated → /admin/login renders without the shell
  if (!user) return <div className="min-h-screen">{children}</div>;

  return (
    <MediaSelectorProvider>
      <div className="flex min-h-screen flex-col lg:flex-row">
        {/* Mobile: compact top bar. Desktop: full sidebar. */}
        <aside className="border-b border-line bg-surface lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
          <div className="flex items-center justify-between px-4 py-3 lg:block lg:p-5">
            <Link href="/admin" className="font-display text-lg font-bold">
              Hilman<span className="text-pen">.</span>{" "}
              <span className="font-hand text-lg text-faint">studio</span>
            </Link>
            <div className="flex items-center gap-1 lg:mt-2">
              <ThemeToggle />
            </div>
          </div>
          {/* desktop-only nav — mobile uses the bottom tab bar */}
          <div className="hidden lg:block">
            <AdminNav />
          </div>
          <div className="hidden border-t border-line p-5 lg:block">
            <p className="truncate text-xs text-faint">{user.email}</p>
            <div className="mt-3 flex items-center gap-4 text-sm">
              <Link href="/" className="text-pen hover:underline">
                View site ↗
              </Link>
              <form action={signOut}>
                <button className="text-soft hover:text-red">Sign out</button>
              </form>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:py-8">{children}</main>
      </div>

      <CommandPalette />
      <MobileTabs />
    </MediaSelectorProvider>
  );
}
