/**
 * Win-back audiences (campaign `offer_rules.audienceTags`): who to tag so a
 * campaign's offer reaches only them. The Function checks the tag at
 * checkout; `campaigns audience` writes it. See docs/campaigns.md.
 */

/** A cancelled Recharge subscription, as far as lapsing goes. */
export interface CancelledSubscription {
  readonly customerId: number;
  /** "2026-09-14T10:02:11", or null when Recharge has none. */
  readonly cancelledAt: string | null;
}

/**
 * Recharge customers who've lapsed: every subscription cancelled, the last
 * one since `since`. Anyone with an active subscription is still a
 * subscriber, whatever else they cancelled.
 */
export const lapsedCustomers = (
  cancelled: readonly CancelledSubscription[],
  activeCustomerIds: ReadonlySet<number>,
  since: Date,
): number[] => {
  const lastCancelled = new Map<number, number>();
  for (const subscription of cancelled) {
    if (!subscription.cancelledAt) continue;
    const at = new Date(
      /[zZ]|[+-]\d\d:\d\d$/.test(subscription.cancelledAt)
        ? subscription.cancelledAt
        : `${subscription.cancelledAt}Z`,
    ).getTime();
    if (Number.isNaN(at)) continue;
    lastCancelled.set(
      subscription.customerId,
      Math.max(at, lastCancelled.get(subscription.customerId) ?? 0),
    );
  }
  return [...lastCancelled]
    .filter(([id, at]) => at >= since.getTime() && !activeCustomerIds.has(id))
    .map(([id]) => id)
    .sort((a, b) => a - b);
};

/** A Shopify customer tag the audience field accepts. */
export const AUDIENCE_TAG = /^[A-Za-z0-9][\w :-]{0,39}$/;
