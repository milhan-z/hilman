import type { Metadata } from "next";
import Link from "next/link";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { signOut } from "./actions";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s — Hilman. Studio" },
  robots: { index: false, follow: false },
};

const NAV = [
  { label: "Dashboard", href: "/admin" },
  { label: "Projects", href: "/admin/projects" },
  { label: "Journal", href: "/admin/journal" },
  { label: "Pages", href: "/admin/pages" },
  { label: "Media", href: "/admin/media" },
  { label: "Taxonomy", href: "/admin/taxonomy" },
  { label: "Messages", href: "/admin/messages" },
  { label: "Settings", href: "/admin/settings" },
];

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
    <div className="flex min-h-screen flex-col lg:flex-row">
      <aside className="border-b border-line bg-surface lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between p-5 lg:block">
          <Link href="/admin" className="font-display text-lg font-bold">
            Hilman<span className="text-pen">.</span>{" "}
            <span className="font-hand text-lg text-faint">studio</span>
          </Link>
          <div className="lg:mt-2">
            <ThemeToggle />
          </div>
        </div>
        <nav aria-label="Studio" className="scrollbar-none flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:pb-5">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="whitespace-nowrap rounded px-3 py-2.5 text-sm text-soft transition-colors hover:bg-n-100 hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>
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
      <main className="min-w-0 flex-1 px-5 py-8 sm:px-8">{children}</main>
    </div>
  );
}
