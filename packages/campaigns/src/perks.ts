/**
 * The subscriber perk, done for real (SHO-169): one free item per active
 * subscription, added to its next delivery after the campaign ends, as the
 * campaign's terms promise. Subscribers don't get the sale price
 * (docs/campaigns.md), so this is what they get instead.
 *
 * In Recharge each perk is a one-time product at £0.00 on the subscription's
 * address, dated the subscription's next charge so it ships in the same box.
 * Each carries `_campaign_perk = <campaign>:<subscription id>`, so running
 * again adds nothing twice. `campaigns perks` plans; `--apply` adds.
 */

export const PERK_PROPERTY = "_campaign_perk";

/** An active Recharge subscription, as far as the perk goes. */
export interface PerkSubscription {
  readonly id: number;
  readonly addressId: number;
  /** "2026-12-04", or null when nothing is scheduled. */
  readonly nextChargeDate: string | null;
}

/** A one-time product already on an address. */
export interface PerkOnetime {
  readonly addressId: number;
  readonly properties: readonly { readonly name: string; readonly value: string }[];
}

export interface PerkPlan {
  readonly add: readonly { subscriptionId: number; addressId: number; date: string }[];
  readonly skip: readonly { subscriptionId: number; reason: string }[];
}

/** The property value marking one subscription's perk for one campaign. */
export const perkKey = (handle: string, subscriptionId: number) =>
  `${handle}:${subscriptionId}`;

/**
 * Which subscriptions get the perk now. `endsAt` is the campaign's end: the
 * perk goes with the first delivery after it, so a subscription whose next
 * charge is earlier is skipped this time and picked up by a later run.
 */
export const planPerks = (
  handle: string,
  endsAt: Date,
  subscriptions: readonly PerkSubscription[],
  onetimes: readonly PerkOnetime[],
): PerkPlan => {
  const given = new Set(
    onetimes.flatMap((onetime) =>
      onetime.properties.filter((p) => p.name === PERK_PROPERTY).map((p) => p.value),
    ),
  );
  // The end as a UK date: a charge on the campaign's last day is still "during".
  const endDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/London" }).format(
    new Date(endsAt.getTime() - 1),
  );
  const add: { subscriptionId: number; addressId: number; date: string }[] = [];
  const skip: { subscriptionId: number; reason: string }[] = [];
  for (const subscription of subscriptions) {
    if (given.has(perkKey(handle, subscription.id))) {
      skip.push({ subscriptionId: subscription.id, reason: "already added" });
    } else if (!subscription.nextChargeDate) {
      skip.push({ subscriptionId: subscription.id, reason: "no next charge scheduled" });
    } else if (subscription.nextChargeDate <= endDay) {
      skip.push({
        subscriptionId: subscription.id,
        reason: `next charge ${subscription.nextChargeDate} isn't after the campaign; run again later`,
      });
    } else {
      add.push({
        subscriptionId: subscription.id,
        addressId: subscription.addressId,
        date: subscription.nextChargeDate,
      });
    }
  }
  return { add, skip };
};
