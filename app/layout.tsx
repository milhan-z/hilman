import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import { SITE_NAME, siteUrl } from "@/lib/site";
import "./globals.css";
// The HILMAN BITS motion styles, in the same stylesheet as everything else.
import "@/components/bits/bits.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // The browser's own toolbar, tinted to the page's paper so a phone shows
  // one surface instead of a white band over a black notebook. This is the
  // Night value; the theme script below and <ThemeToggle /> swap it for Paper.
  themeColor: "#0a0a0a",
};

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
/*
 * All four faces stay preloaded, and that was measured rather than assumed.
 * Dropping the preload on the handwriting and the ledger type looked like an
 * easy 115 KB off the front of every visit, but both are on the first screen
 * of every page — the kicker above each title is Caveat — so the browser only
 * found them at first layout and held that first paint for them. Lighthouse
 * put First Contentful Paint at 1.8 s instead of 0.9 s on a mobile profile.
 */
const caveat = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Hilman — Design, media & code",
    template: "%s — Hilman.",
  },
  description:
    "Meet Hilman, an Informatics student at ITS exploring design, film, photography, motion, and code. Work, notes, and things made together.",
  openGraph: {
    siteName: SITE_NAME,
    type: "website",
  },
};

/**
 * Applied before paint. Night (dark) is the default; honours a stored choice.
 *
 * This has to stay a bare, synchronous <script> in the head. next/script with
 * `beforeInteractive` queues the code onto `self.__next_s` for the Next.js
 * bootstrap to run, which lands after first paint — the theme would flash.
 * Reading a cookie on the server instead would make every route dynamic.
 *
 * React logs "Encountered a script tag while rendering React component" for
 * this in development. It is a development-only warning: the script is in the
 * server HTML and does execute. Running before paint is worth the warning.
 *
 * It also retints <meta name="theme-color">, which Next renders earlier in the
 * head from `viewport` — the colours are --paper in app/globals.css.
 */
const themeScript = `(function(){var t="dark";try{t=localStorage.getItem("hilman-theme");if(t!=="light"&&t!=="dark"){t="dark"}}catch(e){t="dark"}document.documentElement.setAttribute("data-theme",t);var m=document.querySelector('meta[name="theme-color"]');if(m){m.setAttribute("content",t==="light"?"#f4efe3":"#0a0a0a")}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body
        className={`noise ${fraunces.variable} ${inter.variable} ${caveat.variable} ${jetbrains.variable}`}
      >
        {children}
      </body>
    </html>
  );
}
