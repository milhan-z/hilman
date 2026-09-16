import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { AdminNav } from "@/components/admin/nav";
import { CommandPalette } from "@/components/admin/command-palette";
import { StudioTabBar } from "@/components/admin/mobile/studio-tab-bar";
import { KeyboardInset } from "@/components/admin/mobile/keyboard-inset";
import { ThemeToggle } from "@/components/theme-toggle";
import { supabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabase } from "@/lib/supabase/server";
import { checkOwner } from "@/lib/owner";
import { signOut } from "./actions";
import { MediaSelectorProvider } from "@/components/admin/media-library-context";
import { StudioRuntime } from "@/components/admin/studio-runtime";
import { SyncIndicator } from "@/components/admin/sync-indicator";
import { SignOutButton } from "@/components/admin/sign-out-button";

export const metadata: Metadata = {
  title: { default: "Studio", template: "%s — Hilman. Studio" },
  robots: { index: false, follow: false },
  // Linked here rather than from app/manifest.ts: the file convention would put
  // an "install Hilman. Studio" prompt in front of every reader of the public
  // notebook, for an admin tool they cannot open.
  manifest: "/studio.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Studio",
    // The status bar blends into --paper instead of sitting as a white band
    // above a black app.
    statusBarStyle: "black-translucent",
  },
  icons: { apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  // The keyboard should take space away from the page rather than sit on top
  // of it, so a sticky save bar stays above it. Where this is unsupported —
  // Safari, at the time of writing — <KeyboardInset /> measures the same thing
  // from visualViewport and the two agree.
  interactiveWidget: "resizes-content",
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

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // unauthenticated → /admin/login renders without the shell. No runtime here:
  // there is no session to sync with, and a service worker registered from the
  // login screen would outlive a visit that never got in.
  if (!user) return <div className="min-h-[100dvh]">{children}</div>;

  // Signed in is not the same as owning the site. A non-owner gets a door,
  // not a studio — and RLS would refuse their writes anyway.
  const owner = await checkOwner();
  if (!owner.ok) {
    return (
      <div className="mx-auto max-w-xl px-5 py-24 text-center">
        <h1 className="font-display text-2xl font-bold">
          {owner.reason === "unavailable" ? "Studio access is temporarily unavailable" : "This isn’t your studio"}
        </h1>
        <p className="mt-4 text-soft">{owner.message}</p>
        <p className="mt-2 text-sm text-soft">Signed in as {user.email}.</p>
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <Link href="/" className="text-pen underline underline-offset-4">
            ← Back to the site
          </Link>
          <form action={signOut}>
            <button className="text-soft hover:text-red">Sign out</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <MediaSelectorProvider>
      <StudioRuntime />
      <KeyboardInset />
      {/* min-h-[100dvh], not 100vh: Safari's toolbar makes vh taller than the
          space you can actually see, which pushes the bottom bar off-screen. */}
      <div className="flex min-h-[100dvh] flex-col lg:flex-row">
        {/* Mobile: compact top bar. Desktop: full sidebar. */}
        <aside className="border-b border-line bg-surface pt-[env(safe-area-inset-top)] lg:w-60 lg:shrink-0 lg:border-b-0 lg:border-r lg:pt-0">
          <div className="flex items-center justify-between gap-2 px-4 py-2.5 lg:block lg:p-5">
            <Link href="/admin" className="shrink-0 font-display text-lg font-bold">
              Hilman<span className="text-pen">.</span>{" "}
              <span className="font-hand text-lg text-faint">studio</span>
            </Link>
            <div className="flex items-center gap-1.5 lg:mt-3">
              {/* Where your work actually is — queued, syncing, or on the site. */}
              <SyncIndicator />
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
              <SignOutButton />
            </div>
          </div>
        </aside>

        {/* Landscape on a notched phone puts the rounded corner over the left
            or right edge, so the gutters honour those insets too. */}
        <main className="min-w-0 flex-1 py-6 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:pl-[max(2rem,env(safe-area-inset-left))] sm:pr-[max(2rem,env(safe-area-inset-right))] lg:py-8">
          {children}
        </main>
      </div>

      <CommandPalette />
      <StudioTabBar />
    </MediaSelectorProvider>
  );
}
