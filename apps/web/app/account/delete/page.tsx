import { formatDeliveryDate } from "@formulate/recharge";
import {
  DELETION_COPY,
  deletionFailureMessage,
  type DeletionFailureReason,
} from "@formulate/shopify";
import type { Metadata } from "next";
import Link from "next/link";

import { Breadcrumbs } from "@/components/breadcrumbs";
import { previewDeletion } from "@/lib/account-deletion";
import { requireCustomerTokens } from "@/lib/customer-account";

export const metadata: Metadata = {
  title: "Delete your account",
  robots: { index: false, follow: false },
};

const REASONS: readonly DeletionFailureReason[] = [
  "unauthorized",
  "not-configured",
  "not-confirmed",
  "subscriptions",
  "marketing",
  "erasure",
  "rejected",
  "rate-limited",
  "network",
];

interface PageProps {
  readonly searchParams: Promise<{ error?: string }>;
}

/**
 * Account deletion's confirmation (SHO-90): what will happen, which
 * subscriptions will be cancelled, and the two cases worth a warning (a
 * payment due today, prepaid deliveries). The form posts to
 * ./confirm/route.ts, which calls the Worker.
 *
 * A required checkbox rather than typing a word: it's as deliberate, and it
 * doesn't ask anything of a screen-reader or voice-control user that a
 * sighted mouse user is spared.
 */
const DeleteAccountPage = async ({ searchParams }: PageProps) => {
  const tokens = await requireCustomerTokens("/account/delete");
  const preview = await previewDeletion(tokens.accessToken);
  const { error } = await searchParams;
  const failure = REASONS.find((reason) => reason === error);

  return (
    <div className="max-w-2xl">
      <Breadcrumbs
        items={[{ label: "Your account", href: "/account" }, { label: "Delete account" }]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">{DELETION_COPY.heading}</h1>
      <p className="mt-3">{DELETION_COPY.intro}</p>

      {failure ? (
        <p
          role="alert"
          className="mt-6 rounded-md border border-danger px-4 py-3 text-danger"
        >
          {deletionFailureMessage(failure)}
        </p>
      ) : null}

      <h2 className="mt-8 text-xl font-semibold">What happens</h2>
      <ul className="mt-3 list-disc space-y-2 pl-5">
        {DELETION_COPY.whatHappens.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>

      {!preview.ok ? (
        <p role="alert" className="mt-8 text-foreground-muted">
          {deletionFailureMessage(preview.reason)}
        </p>
      ) : (
        <>
          <h2 className="mt-8 text-xl font-semibold">
            {DELETION_COPY.subscriptionsHeading}
          </h2>
          {preview.subscriptions.length === 0 ? (
            <p className="mt-2 text-foreground-muted">{DELETION_COPY.noSubscriptions}</p>
          ) : (
            <ul className="mt-3 divide-y divide-border border-y border-border">
              {preview.subscriptions.map((subscription, index) => {
                const next = formatDeliveryDate(subscription.nextDelivery);
                return (
                  <li key={`${subscription.title}-${index}`} className="py-3">
                    <p className="font-medium">
                      {subscription.title}
                      {subscription.variant ? ` (${subscription.variant})` : ""}
                    </p>
                    {next ? (
                      <p className="text-sm text-foreground-muted">
                        Next delivery {next}
                      </p>
                    ) : null}
                    {subscription.prepaid ? (
                      <p className="mt-1 text-sm">{DELETION_COPY.prepaid}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}

          {preview.chargeToday ? (
            <p className="mt-4 rounded-md border border-border bg-surface-muted px-4 py-3 text-sm">
              {DELETION_COPY.chargeToday}
            </p>
          ) : null}

          <form action="/account/delete/confirm" method="post" className="mt-8 space-y-4">
            <label className="flex items-start gap-3">
              <input type="checkbox" name="understood" required className="mt-1" />
              <span>{DELETION_COPY.confirmLabel}</span>
            </label>
            <div className="flex flex-wrap items-center gap-4">
              <button
                type="submit"
                className="rounded-md bg-danger px-4 py-2 font-semibold text-surface hover:opacity-90"
              >
                {DELETION_COPY.button}
              </button>
              <Link
                href="/account"
                className="text-brand-600 underline underline-offset-4"
              >
                Keep my account
              </Link>
            </div>
          </form>
        </>
      )}
    </div>
  );
};

export { DeleteAccountPage as default };
