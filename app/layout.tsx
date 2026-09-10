import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { siteUrl } from "@/lib/site";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  /**
   * Deliberately not `cover`.
   *
   * With `viewport-fit: cover` iOS draws the page under the status bar, and
   * nothing in this layout reserved that band — so on a phone the page heading
   * scrolled up into it, sharp and unblurred, behind the clock and battery.
   * The site has no edge-to-edge artwork that needs the extra strip, so letting
   * Safari inset the content is both simpler and steadier than reserving the
   * safe area by hand on every fixed element.
   */
  viewportFit: "auto",
  /**
   * Tints the browser chrome (and, on iOS, the status-bar strip) to match the
   * page, so the bar reads as part of the site rather than a seam above it.
   * Not media-based: the theme here is a stored choice, not an OS preference,
   * so the boot script and the toggle keep this value in step with it.
   */
  themeColor: "#0a0a0a",
};

/** Kept in sync with --paper in globals.css. */
const PAPER = { dark: "#0a0a0a", light: "#f4efe3" } as const;

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Hilman. — a living creative archive",
    template: "%s — Hilman.",
  },
  description:
    "Hilman works between design, media, and code. This is his living archive — selected work, a journal, and live experiments.",
  openGraph: {
    siteName: "Hilman.",
    type: "website",
  },
};

/**
 * Applied before paint. Night (dark) is the default; honours a stored choice.
 *
 * It also marks the document as scripted. Scroll reveals hide their content
 * from CSS under `html.js`, so if this script never runs the page renders fully
 * visible instead of blank — the reveal observer is what would have shown it.
 */
const bootScript = `(function(){var d=document.documentElement;d.classList.add("js");var t="dark";try{var s=localStorage.getItem("hilman-theme");if(s==="light"||s==="dark"){t=s}}catch(e){}d.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",t==="light"?"${PAPER.light}":"${PAPER.dark}")}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: bootScript }} />
      </head>
      <body
        className={`noise ${fraunces.variable} ${inter.variable} ${caveat.variable} ${jetbrains.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
