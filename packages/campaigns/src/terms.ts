import { formatMoney, type Campaign, type OfferRules } from "@formulate/shopify";

/**
 * A campaign's terms, written from its rules (SHO-169), so the wording can't
 * drift from what checkout charges: the dates in UK time, the offer, who and
 * what it covers, its limits, what it won't combine with, and the subscriber
 * perk. `campaigns terms` prints them, `--apply` saves them, and `check` warns
 * when the saved terms say something else. Edit freely after; check will say
 * so, which is the point.
 */

/** Every campaign here is on a demo store: shoppers must never think it's real. */
export const DEMO_NOTE =
  "This is a demo store: checkout is in test mode and nothing is charged or shipped.";

const ukLong = (at: Date): string => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(at)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.hour}:${parts.minute} on ${parts.weekday} ${parts.day} ${parts.month} ${parts.year}`;
};

const ukDate = (at: Date): string =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "long",
  }).format(at);

/** The offer in words, as a shopper reads it. */
export const offerInWords = (rules: OfferRules): string => {
  switch (rules.type) {
    case "percent":
      return `${rules.percent}% off`;
    case "tiered":
      return rules.tiers
        .map(
          (tier) =>
            `${tier.percent}% off when you spend ${formatMoney(tier.minSubtotal)}`,
        )
        .join(", or ");
    case "bundle":
      return `buy ${rules.buy}, get the cheapest ${rules.free === 1 ? "one" : rules.free} free`;
    case "gift":
      return `a free ${rules.giftLabel} when you spend ${formatMoney(rules.minSubtotal)} on`;
  }
};

const reach = (rules: OfferRules): string =>
  rules.appliesTo === "one_time"
    ? "one-time purchases"
    : rules.appliesTo === "subscriptions"
      ? "the first delivery of a new subscription"
      : "one-time purchases and subscriptions";

export const campaignTerms = (
  campaign: Campaign,
  rules: OfferRules,
  { demo = true }: { readonly demo?: boolean } = {},
): string => {
  // ends_at is the first moment it's over; the last one covered is a minute before.
  const lastMinute = new Date(campaign.endsAt.getTime() - 60_000);
  const sentences = [
    `${offerInWords(rules).replace(/^./, (c) => c.toUpperCase())} ${reach(rules)} of the products on this page, from ${ukLong(campaign.startsAt)} to ${ukLong(lastMinute)} (UK time).`,
    rules.type === "gift"
      ? `Add the ${rules.giftLabel} to your basket to get it free; one per order`
      : null,
    campaign.discountCode
      ? `Enter the code ${campaign.discountCode} at checkout.`
      : "Taken automatically at checkout.",
    campaign.audience === "email_link" ? "Only through the link in our email" : null,
    rules.audienceTags.length > 0
      ? "Only for the customers we've emailed it to, signed in to their account"
      : null,
    rules.maxUnits !== null
      ? `Up to ${rules.maxUnits} of each product per order at the offer price; more are full price`
      : null,
    rules.oncePerCustomer ? "Once per customer, signed in to their account" : null,
    rules.appliesTo === "one_time" ? "Doesn't apply to subscriptions" : null,
    "Can't be combined with other discounts or codes, except free delivery",
    // How campaigns perks gives it: one per active subscription, next delivery after the end.
    campaign.subscriberPerk
      ? `Subscribers: ${campaign.subscriberPerk.replace(/[.,]\s*$/, "")}; one per active subscription, added to the next delivery after ${ukDate(lastMinute)}`
      : null,
    demo ? DEMO_NOTE : null,
  ];
  return sentences
    .filter((s): s is string => Boolean(s))
    .map((s) => (/[.!?]$/.test(s) ? s : `${s}.`))
    .join(" ");
};
