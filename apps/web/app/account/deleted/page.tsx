import { DELETION_COPY } from "@formulate/shopify";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Account deleted",
  robots: { index: false, follow: false },
};

/** Where deletion lands (SHO-90). Static: the session is already gone. */
const AccountDeletedPage = () => (
  <div className="max-w-2xl">
    <h1 className="text-3xl font-semibold tracking-tight">
      {DELETION_COPY.deleted.heading}
    </h1>
    <p className="mt-3">{DELETION_COPY.deleted.body}</p>
    <Link
      href="/"
      className="mt-6 inline-block text-brand-600 underline underline-offset-4"
    >
      Back to the shop
    </Link>
  </div>
);

export { AccountDeletedPage as default };
