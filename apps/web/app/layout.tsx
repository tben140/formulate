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
    <body className="min-h-screen">
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
      <main className="mx-auto max-w-5xl px-4 py-8">{children}</main>
    </body>
  </html>
);

export { RootLayout as default };
