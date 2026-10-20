import type { RechargeSubscription } from "@formulate/recharge";
import Link from "next/link";

import { changeSubscriptionAction } from "@/app/actions/subscription";

import { SubmitButton } from "./submit-button";

/**
 * What a customer can change on one subscription (SHO-73, SHO-74). Plain
 * forms posting to one Server Action, so they work without JavaScript.
 */

/** As the cart and the Worker: never more than 6 of one product. */
const MAX_QUANTITY = 6;

const PRIMARY =
  "rounded-md bg-brand-600 px-4 py-2 text-sm font-semibold text-surface hover:bg-brand-700";
const SECONDARY =
  "rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-surface-muted";
const FIELD = "rounded-md border border-border bg-surface px-3 py-2 text-sm";

const DAY_MS = 24 * 60 * 60 * 1000;
const isoDay = (offsetDays: number, now = Date.now()) =>
  new Date(now + offsetDays * DAY_MS).toISOString().slice(0, 10);

/** Every form carries the subscription; the Worker checks it's the customer's. */
const Hidden = ({ id, action }: { id: number; action: string }) => (
  <>
    <input type="hidden" name="subscriptionId" value={id} />
    <input type="hidden" name="action" value={action} />
  </>
);

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <section className="border-b border-border py-5">
    <h3 className="font-semibold">{title}</h3>
    <div className="mt-3">{children}</div>
  </section>
);

export const SubscriptionControls = ({
  subscription,
}: {
  readonly subscription: RechargeSubscription;
}) => {
  const id = subscription.id;

  if (subscription.status === "cancelled") {
    return (
      <form action={changeSubscriptionAction} className="mt-8">
        <Hidden id={id} action="reactivate" />
        <SubmitButton className={PRIMARY} pendingLabel="Restarting…">
          Restart this subscription
        </SubmitButton>
      </form>
    );
  }
  if (subscription.status !== "active") return null;

  return (
    <div className="mt-8">
      <h2 className="text-xl font-semibold">Manage</h2>

      {subscription.is_skippable ? (
        <Section title="Skip the next delivery">
          <p className="text-sm text-foreground-muted">
            Nothing is charged or sent; the one after goes ahead as normal.
          </p>
          <form action={changeSubscriptionAction} className="mt-3">
            <Hidden id={id} action="skip" />
            <SubmitButton className={SECONDARY} pendingLabel="Skipping…">
              Skip next delivery
            </SubmitButton>
          </form>
        </Section>
      ) : null}

      <Section title="Pause">
        <form
          action={changeSubscriptionAction}
          className="flex flex-wrap items-end gap-3"
        >
          <Hidden id={id} action="pause" />
          <label className="flex flex-col gap-1 text-sm">
            Move the next delivery back by
            <select name="months" defaultValue="1" className={FIELD}>
              <option value="1">1 month</option>
              <option value="2">2 months</option>
              <option value="3">3 months</option>
            </select>
          </label>
          <SubmitButton className={SECONDARY} pendingLabel="Pausing…">
            Pause
          </SubmitButton>
        </form>
      </Section>

      <Section title="Change the next delivery date">
        <form
          action={changeSubscriptionAction}
          className="flex flex-wrap items-end gap-3"
        >
          <Hidden id={id} action="reschedule" />
          <label className="flex flex-col gap-1 text-sm">
            New date
            <input
              type="date"
              name="date"
              required
              min={isoDay(1)}
              max={isoDay(365)}
              defaultValue={
                subscription.next_charge_scheduled_at?.slice(0, 10) ?? undefined
              }
              className={FIELD}
            />
          </label>
          <SubmitButton className={SECONDARY} pendingLabel="Saving…">
            Change date
          </SubmitButton>
        </form>
      </Section>

      <Section title="Quantity">
        <form
          action={changeSubscriptionAction}
          className="flex flex-wrap items-end gap-3"
        >
          <Hidden id={id} action="quantity" />
          <label className="flex flex-col gap-1 text-sm">
            Per delivery
            <select
              name="quantity"
              defaultValue={String(subscription.quantity)}
              className={FIELD}
            >
              {Array.from({ length: MAX_QUANTITY }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <SubmitButton className={SECONDARY} pendingLabel="Saving…">
            Update
          </SubmitButton>
        </form>
      </Section>

      <p className="py-5 text-sm">
        <Link
          href={`/account/subscriptions/${id}/cancel`}
          className="text-brand-600 underline underline-offset-4"
        >
          Cancel subscription
        </Link>
      </p>
    </div>
  );
};

const DONE: Record<string, string> = {
  skip: "Your next delivery is skipped.",
  unskip: "Your next delivery is back on.",
  reschedule: "Your next delivery date has changed.",
  pause: "Paused. Your next delivery has moved back.",
  quantity: "Quantity updated.",
  cancel: "Your subscription is cancelled. You can restart it here any time.",
  reactivate: "Your subscription is active again.",
};

const ERRORS: Record<string, string> = {
  "not-allowed": "That change isn't available for this subscription.",
  invalid: "That didn't look right. Check the date or amount and try again.",
  "not-found": "We couldn't find that subscription.",
};

/**
 * The outcome of the last change, read from the URL. `role="status"` so a
 * screen reader announces it after the page reloads with it.
 */
export const ChangeMessage = ({
  subscriptionId,
  done,
  error,
  chargeId,
}: {
  readonly subscriptionId: number;
  readonly done?: string;
  readonly error?: string;
  readonly chargeId?: string;
}) => {
  if (error) {
    return (
      <p role="alert" className="mt-6 rounded-md border border-danger px-4 py-3 text-sm">
        {ERRORS[error] ??
          "We couldn't make that change just now. Please try again in a moment."}
      </p>
    );
  }
  const message = done ? DONE[done] : undefined;
  if (!message) return null;
  return (
    <div
      role="status"
      className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border px-4 py-3 text-sm"
    >
      <span>{message}</span>
      {done === "skip" && chargeId && /^\d+$/.test(chargeId) ? (
        <form action={changeSubscriptionAction}>
          <Hidden id={subscriptionId} action="unskip" />
          <input type="hidden" name="chargeId" value={chargeId} />
          <SubmitButton className={SECONDARY} pendingLabel="Undoing…">
            Undo
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
};
