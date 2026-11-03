import { DELETION_COPY } from "@formulate/shopify";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How to delete your account",
  description: "Delete your Formulate account from the website or the app.",
};

/**
 * How to delete an account (SHO-90), public and signed-out.
 *
 * App stores ask for a web page explaining account deletion that works for
 * someone who no longer has the app; this is it. Same promise as the
 * confirmation screen, from the same copy.
 */
const DeleteHelpPage = () => (
  <div className="max-w-2xl">
    <h1 className="text-3xl font-semibold tracking-tight">How to delete your account</h1>

    <h2 className="mt-8 text-xl font-semibold">On the website</h2>
    <ol className="mt-3 list-decimal space-y-2 pl-5">
      <li>
        <Link
          href="/account/delete"
          className="text-brand-600 underline underline-offset-4"
        >
          Go to Delete your account
        </Link>{" "}
        and sign in if asked.
      </li>
      <li>Check the subscriptions that will be cancelled.</li>
      <li>
        Tick &ldquo;{DELETION_COPY.confirmLabel}&rdquo; and choose &ldquo;
        {DELETION_COPY.button}&rdquo;.
      </li>
    </ol>

    <h2 className="mt-8 text-xl font-semibold">In the app</h2>
    <p className="mt-3">
      Open the Account tab, sign in, and choose &ldquo;Delete account&rdquo; at the
      bottom.
    </p>

    <h2 className="mt-8 text-xl font-semibold">What happens</h2>
    <ul className="mt-3 list-disc space-y-2 pl-5">
      {DELETION_COPY.whatHappens.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  </div>
);

export { DeleteHelpPage as default };
