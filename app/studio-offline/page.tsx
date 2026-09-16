import type { Metadata } from "next";
import { OfflineShell } from "./offline-shell";

/**
 * The page the service worker hands over when a studio navigation cannot reach
 * the network.
 *
 * It is a public, static route on purpose. The service worker stores it in
 * Cache Storage, and nothing private is ever put there — the personal half of
 * this screen is read from IndexedDB once it is running in the browser.
 */

export const metadata: Metadata = {
  // Absolute: the root layout's "%s — Hilman." template would otherwise make
  // this read "Offline — Hilman. Studio — Hilman."
  title: { absolute: "Offline — Hilman. Studio" },
  robots: { index: false, follow: false },
};

export default function StudioOfflinePage() {
  return (
    <main className="dotgrid min-h-[100dvh] bg-paper">
      <OfflineShell />
    </main>
  );
}
