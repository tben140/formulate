import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Page not found" };

/**
 * The 404 page, for unknown routes and for `notFound()` from the product and
 * collection routes. Same copy as the theme's sections/404.liquid, so a
 * missing page reads the same on both surfaces.
 *
 * "Back to shopping" goes to `/`, which redirects to the default collection.
 * The theme links to /collections/all, but that collection exists only in
 * Liquid; the Storefront API has no "all" handle, so here it would itself 404.
 */
const NotFound = () => (
  <div className="py-8">
    <h1 className="text-3xl font-semibold tracking-tight">404</h1>
    <p className="mt-2 text-foreground-muted">Page not found.</p>
    <p className="mt-4">
      <Link href="/" className="text-brand-600 underline underline-offset-4">
        Back to shopping
      </Link>
    </p>
  </div>
);

export { NotFound as default };
