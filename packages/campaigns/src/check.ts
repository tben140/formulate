import { campaignParagraphs, offerPercents, parseOfferRules } from "@formulate/shopify";

import { campaignOf } from "./campaign-node";
import { isPersonalPool, PERSONAL_POOL } from "./codes";
import { DEFAULT_MIN_MARGIN, marginRows } from "./margins";
import { checkReferencePrice, REFERENCE_DAYS } from "./price-history";
import { campaignTerms } from "./terms";
import { campaignDiscounts, discountConfig, sameConfig } from "./sync";
import type { Finding, Snapshot } from "./types";

/**
 * Percentages campaign copy may mention that aren't the offer: subscribe and
 * save is 15% on every product (docs/campaigns.md), and copy explaining why
 * subscribers get a perk instead says so.
 */
export const OTHER_PERCENTS: readonly number[] = [15];

/** Every "25%" or "25 %" in a text. */
export const percentsIn = (text: string): number[] =>
  [...text.matchAll(/(\d{1,3})\s?%/g)].map((match) => Number(match[1]));

const DAY = 24 * 60 * 60 * 1000;

/** Units on hand under which a campaign variant gets a warning. */
export const DEFAULT_MIN_STOCK = 10;

/** Approving writes the record too, so its own save lands just after. */
const APPROVAL_SLACK_MS = 2 * 60 * 1000;

/**
 * Everything that must agree before a campaign goes live, from one snapshot
 * of the store (and Klaviyo, when there's a key). Errors are what would show
 * shoppers something untrue or charge the wrong price; warnings are worth a
 * look. See docs/campaigns.md, "The campaigns CLI".
 */
export const checkCampaign = (
  snapshot: Snapshot,
  now: Date = new Date(),
  {
    minMargin = DEFAULT_MIN_MARGIN,
    minStock = DEFAULT_MIN_STOCK,
  }: { readonly minMargin?: number; readonly minStock?: number } = {},
): Finding[] => {
  const { entry, collection, products, discounts, emails } = snapshot;
  const findings: Finding[] = [];
  const error = (message: string) => findings.push({ level: "error", message });
  const warn = (message: string) => findings.push({ level: "warning", message });
  const ok = (message: string) => findings.push({ level: "ok", message });

  // The record itself, judged by the same rules the surfaces use.
  const campaign = campaignOf(entry, collection?.handle);
  if (!campaign) {
    error(
      "The campaign can't be shown: it needs a title, badge, offer, terms, and a start before its end.",
    );
    return findings;
  }
  ok(`Runs ${campaign.startsAt.toISOString()} to ${campaign.endsAt.toISOString()}.`);
  if (!entry.published)
    warn("It's a draft: no surface shows it until it's published (Active).");
  if (campaign.endsAt <= now)
    warn("It has already ended. Delete it, its collection and discount (Housekeeping).");
  if (entry.fields.image && !entry.imageAlt?.trim()) warn("The image has no alt text.");
  if (entry.fields.subscriber_perk && !entry.fields.perk_variant)
    warn(
      "The subscriber perk is described but has no perk_variant, so campaigns perks can't add it.",
    );
  // Sign-off: someone approved it, and nothing has changed since.
  const approvedAt = entry.fields.approved_at ? new Date(entry.fields.approved_at) : null;
  if (
    !approvedAt ||
    Number.isNaN(approvedAt.getTime()) ||
    !entry.fields.approved_by?.trim()
  ) {
    error("Not signed off: run campaigns approve <handle> --by <name> once it's right.");
  } else if (
    entry.updatedAt &&
    new Date(entry.updatedAt).getTime() > approvedAt.getTime() + APPROVAL_SLACK_MS
  ) {
    error(
      `Changed since ${entry.fields.approved_by} approved it (${approvedAt.toISOString()}; changed ${entry.updatedAt}): see campaigns history, then approve again.`,
    );
  } else {
    ok(`Signed off by ${entry.fields.approved_by}, ${approvedAt.toISOString()}.`);
  }
  if (entry.fields.early_access_starts_at && !campaign.earlyAccessStartsAt)
    error("early_access_starts_at isn't before starts_at, so it's ignored.");

  // The offer as data, and the wording against it.
  const rules = parseOfferRules(entry.fields.offer_rules);
  if (entry.fields.offer_rules && !rules) {
    error(
      "offer_rules doesn't parse: shoppers see no price, and the Function gives nothing.",
    );
  } else if (!rules) {
    warn(
      "No offer_rules: no campaign price before checkout, and the Function can't be used.",
    );
  }
  const allowed = new Set([...(rules ? offerPercents(rules) : []), ...OTHER_PERCENTS]);
  const copy: [string, string | null | undefined][] = [
    ["offer", entry.fields.offer],
    ["headline", entry.fields.headline],
    ["banner_text", entry.fields.banner_text],
    ["subscriber_perk", entry.fields.subscriber_perk],
    ["body", campaignParagraphs(entry.fields.body ?? null).join(" ")],
    ["terms", entry.fields.terms],
  ];
  if (rules) {
    for (const [key, text] of copy) {
      const wrong = percentsIn(text ?? "").filter((percent) => !allowed.has(percent));
      if (wrong.length > 0)
        error(
          `${key} says ${wrong.map((p) => `${p}%`).join(", ")}, but the offer gives ${describe(rules)}.`,
        );
    }
  }
  if (
    rules?.type === "percent" &&
    !percentsIn(entry.fields.offer ?? "").includes(rules.percent)
  )
    warn(`offer doesn't mention ${rules.percent}%.`);

  // The terms as the rules would write them: a difference is worth a look.
  if (
    rules &&
    entry.fields.terms &&
    campaignTerms(campaign, rules) !== entry.fields.terms
  )
    warn(
      "terms differ from what the offer's rules write: run campaigns terms <handle> to compare.",
    );

  // Limits and audiences: only the Function enforces them, and the terms must say them.
  const terms = (entry.fields.terms ?? "").toLowerCase();
  if (rules?.audienceTags.length && entry.fields.audience !== "email_link")
    error(
      `The offer is only for customers tagged ${rules.audienceTags.join(" or ")}, so it must be email-link only (audience email_link): otherwise everyone sees an offer most can't get.`,
    );
  if (rules?.oncePerCustomer && !/once|one per customer|per customer/.test(terms))
    warn("The offer is once per customer, but the terms don't say so.");
  if (
    rules?.maxUnits != null &&
    !new RegExp(`\\b${rules.maxUnits}\\b|up to|maximum|limit`).test(terms)
  )
    warn(
      `The offer covers up to ${rules.maxUnits} of each product, but the terms don't say so.`,
    );
  if (rules?.oncePerCustomer || rules?.audienceTags.length)
    ok(
      "Signed-in customers only can be limited or targeted: guests can't be told apart at checkout.",
    );

  // The products.
  if (!collection) {
    error(
      "No collection: the landing page has no products, and nothing can be discounted.",
    );
  } else {
    if (!collection.ruleMatchesCampaign)
      error(
        `Collection ${collection.handle} isn't the smart collection "Campaign equals this campaign".`,
      );
    if (collection.productsCount === 0)
      error(`Collection ${collection.handle} has no products.`);
    else ok(`${collection.productsCount} products in ${collection.handle}.`);
  }
  const inactive = products.filter((product) => product.status !== "ACTIVE");
  if (inactive.length > 0)
    warn(`Not active, so not on sale: ${inactive.map((p) => p.title).join(", ")}.`);
  const offStore = products.filter(
    (product) => product.status === "ACTIVE" && !product.onOnlineStore,
  );
  if (offStore.length > 0)
    warn(
      `${offStore.length} of ${products.length} products aren't on the Online Store channel, so the theme won't show them${offStore.length <= 5 ? `: ${offStore.map((p) => p.title).join(", ")}` : ""}.`,
    );
  const narrowed = products.some((product) =>
    product.variants.some((variant) => variant.campaignId !== null),
  );
  if (narrowed && rules && rules.type !== "percent")
    error(
      "Some products are narrowed to certain variants: that works with percent offers only.",
    );

  // The prices: an honest "normally", and a margin left at the campaign price.
  const listed = (limit: number, names: readonly string[]) =>
    names.length <= limit
      ? names.join(", ")
      : `${names.slice(0, limit).join(", ")} and ${names.length - limit} more`;
  const onSale = products
    .filter((product) => product.status === "ACTIVE")
    .flatMap((product) => {
      const narrowedTo = product.variants.filter(
        (variant) => variant.campaignId !== null,
      );
      return (narrowedTo.length > 0 ? narrowedTo : product.variants).map((variant) => ({
        ...variant,
        label:
          !variant.title || variant.title === "Default Title"
            ? product.title
            : `${product.title}, ${variant.title}`,
      }));
    });
  // Stock: a campaign shouldn't send people to something they can't buy.
  const tracked = onSale.filter((variant) => variant.stock != null);
  const soldOut = tracked.filter((variant) => variant.stock! <= 0);
  const low = tracked.filter(
    (variant) => variant.stock! > 0 && variant.stock! < minStock,
  );
  if (soldOut.length > 0)
    warn(
      `Sold out: ${listed(
        5,
        soldOut.map((v) => v.label),
      )}. They show last on the campaign page.`,
    );
  if (low.length > 0)
    warn(
      `Under ${minStock} in stock: ${listed(
        5,
        low.map((v) => `${v.label} (${v.stock})`),
      )}.`,
    );
  if (tracked.length > 0 && soldOut.length === 0 && low.length === 0)
    ok(`Every tracked variant has at least ${minStock} in stock.`);

  if (rules && onSale.length > 0) {
    const raised: string[] = [];
    const unknown: string[] = [];
    for (const variant of onSale) {
      const result = checkReferencePrice(
        variant.priceHistory ?? [],
        variant.price,
        campaign.startsAt,
      );
      if (result.ok) continue;
      if (result.reason === "raised")
        raised.push(
          `${variant.label} (£${result.lower} on ${result.on}, now £${variant.price})`,
        );
      else unknown.push(variant.label);
    }
    if (raised.length > 0)
      error(
        `Raised in the ${REFERENCE_DAYS} days before the campaign, so "Normally" would mislead: ${listed(5, raised)}.`,
      );
    if (unknown.length > 0)
      warn(
        `No ${REFERENCE_DAYS}-day price history for ${unknown.length} of ${onSale.length} variants, so "Normally" can't be checked: run campaigns prices record daily (docs/campaigns.md).`,
      );
    if (raised.length === 0 && unknown.length === 0)
      ok(`Every "Normally" price held for the ${REFERENCE_DAYS} days before the start.`);

    const rows = marginRows(
      rules,
      onSale.map((v) => ({ title: v.label, price: v.price, cost: v.cost ?? null })),
    );
    const loss = rows.filter((row) => row.cost !== null && row.worst < row.cost);
    const thin = rows.filter(
      (row) => row.margin !== null && row.margin < minMargin && !loss.includes(row),
    );
    const noCost = rows.filter((row) => row.cost === null);
    if (loss.length > 0)
      error(
        `Sold below cost at the campaign price: ${listed(
          5,
          loss.map(
            (r) => `${r.title} (£${r.worst.toFixed(2)}, costs £${r.cost!.toFixed(2)})`,
          ),
        )}.`,
      );
    if (thin.length > 0)
      warn(
        `Under a ${minMargin}% margin at the campaign price: ${listed(
          5,
          thin.map((r) => `${r.title} (${r.margin}%)`),
        )}.`,
      );
    if (noCost.length > 0)
      warn(
        `No unit cost in Shopify for ${noCost.length} of ${rows.length} variants, so their margin can't be checked.`,
      );
    if (loss.length === 0 && thin.length === 0 && noCost.length === 0)
      ok(`Every variant keeps at least a ${minMargin}% margin at the campaign price.`);
  }

  // The discount that charges it.
  const errorsBefore = findings.filter((finding) => finding.level === "error").length;
  const mine = campaignDiscounts(entry, discounts);
  const own = mine.filter((discount) => discount.kind !== "shipping");
  const shipping = mine.filter(
    (discount) => discount.kind === "shipping" && discount.status !== "EXPIRED",
  );
  if (rules?.shipping) {
    const offer = rules.shipping;
    if (shipping.length === 0)
      error(
        "offer_rules has free delivery, but there's no free-delivery discount: run campaigns sync.",
      );
    for (const discount of shipping) {
      const name = `Free delivery "${discount.title}"`;
      if (
        new Date(discount.startsAt).getTime() !== campaign.startsAt.getTime() ||
        !discount.endsAt ||
        new Date(discount.endsAt).getTime() !== campaign.endsAt.getTime()
      )
        error(`${name} doesn't run for the campaign's dates.`);
      if (Number(discount.shippingMin ?? 0) !== Number(offer.minSubtotal.amount))
        error(
          `${name} starts at ${discount.shippingMin ?? "0"}, the offer at ${offer.minSubtotal.amount}.`,
        );
      if (
        (discount.shippingMaxRate === null || discount.shippingMaxRate === undefined) !==
          (offer.maxRate === null) ||
        (offer.maxRate &&
          Number(discount.shippingMaxRate) !== Number(offer.maxRate.amount))
      )
        error(
          `${name} covers rates up to ${discount.shippingMaxRate ?? "any"}, the offer ${offer.maxRate?.amount ?? "any"}.`,
        );
    }
  } else if (shipping.length > 0) {
    warn(
      `There's a free-delivery discount titled after the campaign, but offer_rules doesn't mention it: ${shipping.map((d) => d.title).join(", ")}.`,
    );
  }
  if (own.length === 0) {
    error(
      entry.fields.discount_code
        ? `No discount found for code ${entry.fields.discount_code}: nobody gets the offer.`
        : "No discount found for this campaign: nobody gets the offer at checkout.",
    );
  } else {
    const live = own.filter((discount) => discount.status !== "EXPIRED");
    if (live.filter((discount) => discount.method === "automatic").length > 1)
      warn(
        "More than one automatic discount for this campaign: Shopify gives the best one, not both.",
      );
    for (const discount of live) {
      const name = `Discount "${discount.title}"`;
      const startsEarly =
        discount.method === "code" &&
        campaign.earlyAccessStartsAt?.getTime() === new Date(discount.startsAt).getTime();
      if (
        !startsEarly &&
        new Date(discount.startsAt).getTime() !== campaign.startsAt.getTime()
      )
        error(
          `${name} starts ${discount.startsAt}, the campaign ${campaign.startsAt.toISOString()}.`,
        );
      if (
        !discount.endsAt ||
        new Date(discount.endsAt).getTime() !== campaign.endsAt.getTime()
      )
        error(
          `${name} ends ${discount.endsAt ?? "never"}, the campaign ${campaign.endsAt.toISOString()}.`,
        );
      if (entry.fields.audience === "email_link" && discount.method === "automatic")
        error(`${name} is automatic, so everyone gets the email-only offer.`);
      if (
        entry.fields.discount_code &&
        discount.method === "code" &&
        !isPersonalPool(discount.config) &&
        !discount.codes.includes(entry.fields.discount_code)
      )
        error(`${name} doesn't have the code ${entry.fields.discount_code}.`);
      if (discount.kind === "basic" && rules) {
        if (rules.type !== "percent")
          error(
            `${name} is a plain percentage discount; a ${rules.type} offer needs the campaign Function.`,
          );
        else if (discount.percent !== rules.percent)
          error(`${name} gives ${discount.percent}%, the offer ${rules.percent}%.`);
        const wantsSubscriptions = rules.appliesTo !== "one_time";
        const wantsOneTime = rules.appliesTo !== "subscriptions";
        if (
          discount.appliesOnSubscription !== null &&
          discount.appliesOnSubscription !== wantsSubscriptions
        )
          error(
            `${name} ${wantsSubscriptions ? "leaves out" : "includes"} subscriptions; the offer doesn't.`,
          );
        if (
          discount.appliesOnOneTimePurchase !== null &&
          discount.appliesOnOneTimePurchase !== wantsOneTime
        )
          error(
            `${name} ${wantsOneTime ? "leaves out" : "includes"} one-time purchases; the offer doesn't.`,
          );
        if (
          rules.maxUnits !== null ||
          rules.oncePerCustomer ||
          rules.audienceTags.length > 0
        )
          error(
            `${name} is a plain percentage discount, which can't apply the offer's limits or audience: use the campaign Function (campaigns sync).`,
          );
        if (collection && !discount.collectionIds.includes(collection.id))
          error(`${name} isn't on the campaign's collection.`);
      }
      if (discount.kind === "app") {
        const expected = discountConfig(entry, collection, products);
        if ("error" in expected) error(`${name}: ${expected.error}.`);
        else if (
          !sameConfig(
            discount.config,
            isPersonalPool(discount.config)
              ? { ...expected.config, pool: PERSONAL_POOL }
              : expected.config,
          )
        )
          error(`${name}'s config is out of date: run campaigns sync ${entry.handle}.`);
      }
      if (discount.status === "ACTIVE" && now < campaign.startsAt)
        error(`${name} is already active, before the campaign starts.`);
    }
    if (campaign.earlyAccessStartsAt) {
      const early = campaign.earlyAccessStartsAt.getTime();
      if (
        !live.some((d) => d.method === "code" && new Date(d.startsAt).getTime() === early)
      )
        error(
          `Early access starts ${campaign.earlyAccessStartsAt.toISOString()}, but no code discount starts then: email visitors would see the offer without getting it.`,
        );
    }
    if (findings.filter((finding) => finding.level === "error").length === errorsBefore)
      ok(`Discount${own.length > 1 ? "s" : ""}: ${own.map((d) => d.title).join(", ")}.`);
  }

  // The emails, when Klaviyo can be read.
  if (emails) {
    if (emails.length === 0)
      warn(`No Klaviyo campaigns named after "${entry.fields.title}".`);
    for (const email of emails) {
      const name = `Email "${email.name}"`;
      if (email.sendAt) {
        const at = new Date(email.sendAt);
        const earliest = campaign.startsAt.getTime() - 7 * DAY;
        if (at.getTime() >= campaign.endsAt.getTime())
          error(`${name} sends ${email.sendAt}, after the offer ends.`);
        else if (at.getTime() < earliest)
          warn(`${name} sends ${email.sendAt}, over a week before the offer starts.`);
      } else if (email.status !== "Sent") {
        warn(`${name} has no send time.`);
      }
      if (rules) {
        const wrong = percentsIn(email.text).filter((percent) => !allowed.has(percent));
        if (wrong.length > 0)
          error(
            `${name} says ${wrong.map((p) => `${p}%`).join(", ")}, but the offer gives ${describe(rules)}.`,
          );
      }
    }
  }

  return findings;
};

const describe = (rules: NonNullable<ReturnType<typeof parseOfferRules>>): string =>
  rules.type === "percent"
    ? `${rules.percent}%`
    : rules.type === "tiered"
      ? rules.tiers.map((tier) => `${tier.percent}%`).join(" or ")
      : rules.type === "bundle"
        ? `${rules.free} free in ${rules.buy}`
        : `a free ${rules.giftLabel} over ${rules.minSubtotal.amount}`;
