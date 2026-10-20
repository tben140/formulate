import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import Link from "next/link";
import Script from "next/script";
import type { ReactNode } from "react";

import { CartButton } from "@/components/cart-button";
import { CartDrawer } from "@/components/cart-drawer";
import { CartProvider } from "@/components/cart-provider";
import { EmailCapture } from "@/components/email-capture";
import { SiteNav } from "@/components/site-nav";
import { getCart } from "@/lib/cart";
import { KLAVIYO_PUBLIC_KEY, KLAVIYO_SCRIPT_URL } from "@/lib/klaviyo";
import { getNavLinks } from "@/lib/nav";

import "./globals.css";

export const metadata: Metadata = {
  title: "Formulate",
  description: "A headless Shopify storefront built on Next.js and Expo.",
};

/**
 * The cart is fetched here, in the root layout, rather than in the drawer.
 *
 * That is what lets the header count and the drawer contents come from one
 * render of one source — they cannot disagree, because they are the same data.
 * Server Actions call `revalidatePath("/", "layout")`, so a mutation refreshes
 * both without either component fetching anything itself.
 *
 * The cost is that every page pays for a cart query. Acceptable: it is one
 * request against the same Storefront API the page already calls, and the
 * alternative (a client-side fetch on drawer open) trades it for a loading
 * state on the interaction a shopper cares most about.
 */
const RootLayout = async ({ children }: { children: ReactNode }) => {
  // In parallel: neither depends on the other, and both are on every page.
  const [cart, navLinks] = await Promise.all([getCart(), getNavLinks()]);

  return (
    <html lang="en-GB">
      {/*
        flex column so the footer can be pushed to the bottom on short pages
        rather than floating mid-viewport.
      */}
      <body className="flex min-h-screen flex-col">
        <CartProvider storeDomain={process.env.SHOPIFY_STORE_DOMAIN ?? ""}>
          <header className="border-b border-border">
            {/*
              One row from md up: wordmark, collections, cart. Below that the
              collections drop to their own scrolling row, via `order`, so the
              wordmark and cart keep their places.
            */}
            <nav
              aria-label="Main"
              className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-3 px-4 py-4"
            >
              <Link
                href="/"
                className="order-1 text-lg font-semibold tracking-tight text-foreground"
              >
                Formulate
              </Link>
              <SiteNav links={navLinks} />
              <div className="order-2 ml-auto md:order-3">
                <CartButton totalQuantity={cart?.totalQuantity ?? 0} />
              </div>
            </nav>
          </header>

          <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8">{children}</main>

          {/*
            Mirrors apps/theme's sections/footer.liquid so the surfaces match.
            Rendered on the server, so the year needs no hydration guard.
          */}
          <footer className="border-t border-border">
            <div className="mx-auto max-w-5xl px-4 py-6">
              <EmailCapture />
              <p className="mt-6 text-sm text-foreground-muted">
                &copy; {new Date().getFullYear()} Formulate
              </p>
            </div>
          </footer>

          <CartDrawer cart={cart} />
        </CartProvider>

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

        {/*
          Klaviyo onsite. The Liquid theme gets this injected by an app embed;
          a headless surface has no such mechanism, so it is loaded by hand.

          `afterInteractive` rather than `beforeInteractive`: tracking must not
          block first paint, and `lib/klaviyo.ts` queues events that fire
          before the script arrives.

          Omitted entirely when the key is unset, so local dev and CI without
          Klaviyo credentials render a clean page.
        */}
        {KLAVIYO_PUBLIC_KEY ? (
          <Script src={KLAVIYO_SCRIPT_URL} strategy="afterInteractive" />
        ) : null}
      </body>
    </html>
  );
};

export { RootLayout as default };
