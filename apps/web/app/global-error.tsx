"use client";

import { ErrorState } from "@/components/error-state";

import "./globals.css";

/**
 * The last line of defence: an error in the root layout itself, which
 * app/error.tsx can't catch because it renders inside that layout. The
 * layout's cart query is the likeliest cause. This replaces the whole
 * document, so it brings its own <html> and <body>.
 */
const GlobalError = (props: {
  error: Error & { digest?: string };
  reset: () => void;
}) => (
  <html lang="en-GB">
    <body>
      <main className="mx-auto w-full max-w-5xl px-4 py-8">
        <ErrorState {...props} />
      </main>
    </body>
  </html>
);

export { GlobalError as default };
