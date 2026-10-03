import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";

import { CartButton } from "@/components/cart-button";
import { CartDrawer } from "@/components/cart-drawer";
import { CartProvider } from "@/components/cart-provider";
import { DemoNotice } from "@/components/demo-notice";
import { EmailCapture } from "@/components/email-capture";
import { SiteNav } from "@/components/site-nav";
import {
  CookiePreferencesButton,
  TrackingConsentProvider,
} from "@/components/tracking-consent";
import { getCart } from "@/lib/cart";
import { getLegalLinks, getNavLinks } from "@/lib/nav";
import { CONSENT_COOKIE, parseConsent } from "@/lib/consent";
import { isIndexable, SITE_NAME, siteUrl } from "@/lib/site";
import { getCartSuggestions } from "@/lib/recommendations";

import "./globals.css";

/**
 * Site-wide defaults. Each route overrides title, description and canonical.
 *
 * `metadataBase` is what turns every relative URL below (canonicals, Open
 * Graph) into an absolute one. `robots` is the per-page half of keeping
 * previews out of search results; `app/robots.ts` is the other half.
 */
export const metadata: Metadata = {
  metadataBase: siteUrl,
  title: { default: SITE_NAME, template: `%s — ${SITE_NAME}` },
  description: "Supplements built around a 30-day rhythm, from Double Helix.",
  applicationName: SITE_NAME,
  openGraph: { siteName: SITE_NAME, locale: "en_GB", type: "website" },
  twitter: { card: "summary_large_image" },
  robots: isIndexable ? { index: true, follow: true } : { index: false, follow: false },
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
  const [cart, navLinks, legalLinks] = await Promise.all([
    getCart(),
    getNavLinks(),
    getLegalLinks(),
  ]);
  // Needs the cart's lines, so it can't run alongside getCart. Empty carts make
  // no request at all.
  const suggestions = await getCartSuggestions(cart);

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
            <DemoNotice />
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
                <div className="order-2 ml-auto flex items-center gap-2 md:order-3">
                  {/* A link to the search page, not an inline field: it works
                      without JavaScript and keeps the header compact on a phone. */}
                  <Link
                    href="/search"
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
                  >
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 20 20"
                      className="h-4 w-4"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="8.5" cy="8.5" r="5.5" />
                      <path d="m13 13 4 4" strokeLinecap="round" />
                    </svg>
                    Search
                  </Link>
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
                {/*
                  The footer's links come from the Shopify menu "Legal"
                  (SHO-60), the same menu the theme's footer reads.
                */}
                <div className="mt-6 flex flex-wrap items-center justify-between gap-4 text-sm text-foreground-muted">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <p>&copy; {new Date().getFullYear()} Formulate</p>
                    {legalLinks.length > 0 ? (
                      <nav aria-label="Legal">
                        <ul className="flex flex-wrap gap-x-4 gap-y-1">
                          {legalLinks.map((link) => (
                            <li key={link.id}>
                              <Link
                                href={link.path}
                                className="underline-offset-4 hover:text-foreground hover:underline"
                              >
                                {link.title}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </nav>
                    ) : null}
                  </div>
                  <CookiePreferencesButton />
                </div>
              </div>
            </footer>

            <CartDrawer cart={cart} suggestions={suggestions} />
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
