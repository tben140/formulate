import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "Formulate",
  description: "A headless Shopify storefront built on Next.js and Expo.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="en-GB">
    {/*
      flex column so the footer can be pushed to the bottom on short pages
      rather than floating mid-viewport.
    */}
    <body className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <nav className="mx-auto flex max-w-5xl items-center px-4 py-4">
          <Link
            href="/"
            className="text-lg font-semibold tracking-tight text-foreground"
          >
            Formulate
          </Link>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">
        {children}
      </main>

      {/*
        Mirrors apps/theme's sections/footer.liquid so the surfaces match.
        Rendered on the server, so the year needs no hydration guard.
      */}
      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-6 text-sm text-foreground-muted">
          <p>&copy; {new Date().getFullYear()} Formulate</p>
        </div>
      </footer>

      {/*
        Both are no-ops outside Vercel, so local dev and CI builds are
        unaffected. Analytics is cookieless and collects no personal data,
        which keeps it clear of the consent requirements that will apply to
        product analytics later.

        Rendered after the footer so they never sit between semantic landmarks
        — they output no visible markup, but keeping them last leaves the
        document outline clean.
      */}
      <Analytics />
      <SpeedInsights />
    </body>
  </html>
);

export { RootLayout as default };
