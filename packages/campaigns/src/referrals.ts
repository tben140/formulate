import { generateCodes } from "./codes";

/**
 * Refer a friend during a campaign (SHO-169). Each signed-in buyer of the
 * campaign gets a code of their own (`REF-XXXXXXXX`) that gives a friend
 * `friendPercent`% off (once per customer); when a friend's order uses it, the
 * referrer has earned a reward. `campaigns referrals` plans and makes the
 * codes (one code discount holds them all, once per customer), records each on the buyer's customer
 * record (`$app:campaigns.referral_code`) and, with a Klaviyo key, on their
 * profile (`referral_code`) for the email. `--rewards` lists who has earned
 * one; issuing the reward stays a person's call.
 */

export const REFERRAL_PREFIX = "REF";

export interface Buyer {
  readonly customerId: string;
  readonly email: string | null;
  /** Their code from an earlier run, if any. */
  readonly code: string | null;
}

/** New codes for buyers without one; existing ones are kept. */
export const planReferralCodes = (
  buyers: readonly Buyer[],
  generate: (count: number) => string[] = (count) =>
    generateCodes(count, REFERRAL_PREFIX),
): { customerId: string; email: string | null; code: string }[] => {
  const missing = buyers.filter((buyer) => !buyer.code);
  const codes = missing.length > 0 ? generate(missing.length) : [];
  return missing.map((buyer, i) => ({
    customerId: buyer.customerId,
    email: buyer.email,
    code: codes[i]!,
  }));
};

/** An order a friend placed with someone's code. */
export interface ReferralUse {
  readonly order: string;
  readonly code: string;
  readonly friendCustomerId: string | null;
}

/**
 * Who has earned a reward: each referrer with the orders their codes brought
 * in, ignoring a referrer using their own code.
 */
export const earnedRewards = (
  uses: readonly ReferralUse[],
  owners: ReadonlyMap<string, string>,
): { referrer: string; orders: string[] }[] => {
  const byReferrer = new Map<string, string[]>();
  for (const use of uses) {
    const referrer = owners.get(use.code.toUpperCase());
    if (!referrer || referrer === use.friendCustomerId) continue;
    byReferrer.set(referrer, [...(byReferrer.get(referrer) ?? []), use.order]);
  }
  return [...byReferrer].map(([referrer, orders]) => ({ referrer, orders }));
};
