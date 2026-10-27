import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { CartButton } from "@/components/cart-button";
import { CartDrawer } from "@/components/cart-drawer";
import { CartProvider } from "@/components/cart-provider";
import { EmailCapture } from "@/components/email-capture";
import {
  CookiePreferencesButton,
  TrackingConsentProvider,
} from "@/components/tracking-consent";
import { getCart } from "@/lib/cart";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";

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
  const cart = await getCart();

  // Read on the server so the first render is already right: no banner flash
  // for someone who has decided, and no script tag for someone who declined.
  const consent = parseConsent((await cookies()).get(CONSENT_COOKIE)?.value);

  return (
    <html lang="en-GB">
      {/*
        flex column so the footer can be pushed to the bottom on short pages
        rather than floating mid-viewport.
      */}
      <body className="flex min-h-screen flex-col">
        {/*
          Also where Klaviyo onsite is loaded — and only once the shopper
          accepts. The Liquid theme gets that from an app embed deferring to
          Shopify's consent API; here it is ours. See ADR 0008.
        */}
        <TrackingConsentProvider initialConsent={consent}>
          <CartProvider storeDomain={process.env.SHOPIFY_STORE_DOMAIN ?? ""}>
            <header className="border-b border-border">
              <nav className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
                <Link
                  href="/"
                  className="text-lg font-semibold tracking-tight text-foreground"
                >
                  Formulate
                </Link>
                <CartButton totalQuantity={cart?.totalQuantity ?? 0} />
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
                <div className="mt-6 flex items-center justify-between gap-4">
                  <p className="text-sm text-foreground-muted">
                    &copy; {new Date().getFullYear()} Formulate
                  </p>
                  <CookiePreferencesButton />
                </div>
              </div>
            </footer>

            <CartDrawer cart={cart} />
          </CartProvider>
        </TrackingConsentProvider>

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
};

export { RootLayout as default };
