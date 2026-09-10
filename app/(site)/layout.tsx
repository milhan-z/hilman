import { MotionProvider } from "@/components/motion-provider";
import { ScrollProgress } from "@/components/scroll-progress";
import { SiteFooter } from "@/components/site-footer";
import { SiteNav } from "@/components/site-nav";
import { getPage, getSettings, load } from "@/lib/data";
import { DEFAULT_SETTINGS } from "@/lib/types";

export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  // The footer blurb and location come from the Home page record, so nothing
  // about who Hilman is or where he is stays hard-coded in the layout.
  // The chrome must survive a failed read: a broken settings query should cost
  // the visitor a banner, not the whole site.
  const [settingsRes, homeRes] = await Promise.all([load(getSettings), load(() => getPage("home"))]);
  const settings = settingsRes.ok ? settingsRes.value : DEFAULT_SETTINGS;
  const home = homeRes.ok ? homeRes.value : null;
  const chromeDegraded = !settingsRes.ok;
  return (
    <MotionProvider>
      <div className="flex min-h-screen flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded focus:bg-hl focus:px-4 focus:py-2 focus:font-medium focus:text-hl-ink"
      >
        Skip to content
      </a>
      <ScrollProgress />
      <SiteNav items={settings.nav} />
      {chromeDegraded && (
        <p
          role="alert"
          className="border-b border-red/40 bg-red-soft/10 px-5 py-2 text-center text-sm text-red sm:px-8"
        >
          Some site data couldn&apos;t be loaded right now — parts of this page may be missing.
        </p>
      )}
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter settings={settings} blurb={home?.data?.intro} based={home?.data?.based} />
      </div>
    </MotionProvider>
  );
}
