"use client";

import { forgetProductAnalytics } from "@/lib/product-analytics";

/**
 * The account page's Sign out button. Before the form posts, this browser's
 * analytics ids go (SHO-172): otherwise, on a shared computer, the next
 * person's visit would be counted as the customer who just left. Consent
 * stays as it was; a fresh anonymous id starts with the next event.
 */
export const SignOutForm = () => (
  <form action="/account/logout" method="post" onSubmit={() => forgetProductAnalytics()}>
    <button
      type="submit"
      className="rounded-md border border-border px-3 py-1.5 text-sm font-medium hover:bg-surface-muted"
    >
      Sign out
    </button>
  </form>
);
