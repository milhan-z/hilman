import type { Metadata, Viewport } from "next";
import { Caveat, Fraunces, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
  axes: ["opsz"],
});
const inter = Inter({ subsets: ["latin"], variable: "--font-body", display: "swap" });
const caveat = Caveat({ subsets: ["latin"], variable: "--font-hand", display: "swap" });
const jetbrains = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Hilman. — a living creative archive",
    template: "%s — Hilman.",
  },
  description:
    "Hilman is a creative technologist working between design, media, and code. This is his living archive — works, journal, experiments, and an open desk.",
  openGraph: {
    siteName: "Hilman.",
    type: "website",
  },
};

/** Applied before paint. Night (dark) is the default; honours a stored choice. */
const themeScript = `(function(){try{var t=localStorage.getItem("hilman-theme");if(t!=="light"&&t!=="dark"){t="dark"}document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;

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
