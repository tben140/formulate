import { CANCEL_REASONS } from "@formulate/recharge";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { changeSubscriptionAction } from "@/app/actions/subscription";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SubmitButton } from "@/components/submit-button";
import { requireCustomerTokens } from "@/lib/customer-account";
import { loadSubscription } from "@/lib/recharge";

export const metadata: Metadata = {
  title: "Cancel subscription",
  robots: { index: false, follow: false },
};

interface PageProps {
  readonly params: Promise<{ id: string }>;
}

const OFFER =
  "rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-muted";

/**
 * Cancelling, with alternatives first (SHO-74).
 *
 * ⚠️ Cancelling is never more than this one page and one press (SHO-91): the
 * offers sit above the cancel form, not in front of it, the button is on the
 * first screen, and a reason is optional. Checklist: docs/compliance.md. UK subscription rules and the FTC's click-to-cancel principle
 * both expect leaving to be as easy as joining.
 */
const CancelPage = async ({ params }: PageProps) => {
  const { id } = await params;
  const page = `/account/subscriptions/${id}`;
  const tokens = await requireCustomerTokens(`${page}/cancel`);
  const data = await loadSubscription(tokens, id);

  if (data.kind === "not-found") notFound();
  if (data.kind !== "ready") redirect(page);
  const { subscription } = data;
  if (subscription.status !== "active") redirect(page);

  const hidden = (action: string) => (
    <>
      <input type="hidden" name="subscriptionId" value={subscription.id} />
      <input type="hidden" name="action" value={action} />
    </>
  );

  return (
    <article className="max-w-2xl">
      <Breadcrumbs
        items={[
          { label: "Your account", href: "/account" },
          { label: "Subscriptions", href: "/account/subscriptions" },
          { label: subscription.product_title, href: page },
          { label: "Cancel" },
        ]}
      />
      <h1 className="text-3xl font-semibold tracking-tight">
        Cancel {subscription.product_title}?
      </h1>

      <section className="mt-6">
        <h2 className="text-lg font-semibold">Or, instead</h2>
        <ul className="mt-3 flex flex-wrap gap-3">
          {subscription.is_skippable ? (
            <li>
              <form action={changeSubscriptionAction}>
                {hidden("skip")}
                <SubmitButton className={OFFER} pendingLabel="Skipping…">
                  Skip the next delivery
                </SubmitButton>
              </form>
            </li>
          ) : null}
          <li>
            <form action={changeSubscriptionAction}>
              {hidden("pause")}
              <input type="hidden" name="months" value="1" />
              <SubmitButton className={OFFER} pendingLabel="Pausing…">
                Pause for a month
              </SubmitButton>
            </form>
          </li>
          {subscription.quantity > 1 ? (
            <li>
              <form action={changeSubscriptionAction}>
                {hidden("quantity")}
                <input type="hidden" name="quantity" value="1" />
                <SubmitButton className={OFFER} pendingLabel="Saving…">
                  Get 1 per delivery
                </SubmitButton>
              </form>
            </li>
          ) : null}
        </ul>
      </section>

      <form
        action={changeSubscriptionAction}
        className="mt-8 border-t border-border pt-6"
      >
        {hidden("cancel")}
        {/*
          The reasons start closed, so the Cancel button is on the first
          screen on a phone (SHO-91: never behind a scroll).
        */}
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Tell us why <span className="font-normal">(optional)</span>
          </summary>
          <fieldset className="mt-3">
            <legend className="font-semibold">
              Why are you cancelling? <span className="font-normal">(optional)</span>
            </legend>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              {CANCEL_REASONS.map(({ value, label }) => (
                <label key={value} className="flex items-center gap-2">
                  <input type="radio" name="reason" value={value} />
                  {label}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="mt-4 flex flex-col gap-1 text-sm">
            Anything else? <span className="text-foreground-muted">(optional)</span>
            <textarea
              name="comment"
              maxLength={300}
              rows={3}
              className="rounded-md border border-border bg-surface px-3 py-2"
            />
          </label>
        </details>
        <p className="mt-4 text-sm text-foreground-muted">
          Nothing more is charged after you cancel. A delivery that has already been
          charged still arrives.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <SubmitButton
            className="rounded-md bg-danger px-4 py-2 text-sm font-semibold text-surface hover:opacity-90"
            pendingLabel="Cancelling…"
          >
            Cancel subscription
          </SubmitButton>
          <Link
            href={page}
            className="text-sm text-brand-600 underline underline-offset-4"
          >
            Keep my subscription
          </Link>
        </div>
      </form>
    </article>
  );
};

export { CancelPage as default };
