import { campaignParagraphs, offerPercents, parseOfferRules } from "@formulate/shopify";

import { campaignOf } from "./campaign-node";
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

/**
 * Everything that must agree before a campaign goes live, from one snapshot
 * of the store (and Klaviyo, when there's a key). Errors are what would show
 * shoppers something untrue or charge the wrong price; warnings are worth a
 * look. See docs/campaigns.md, "The campaigns CLI".
 */
export const checkCampaign = (snapshot: Snapshot, now: Date = new Date()): Finding[] => {
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

  // The discount that charges it.
  const own = campaignDiscounts(entry, discounts);
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
        if (discount.appliesOnSubscription === rules.oneTimeOnly)
          error(
            `${name} ${rules.oneTimeOnly ? "includes" : "leaves out"} subscriptions; the offer doesn't.`,
          );
        if (collection && !discount.collectionIds.includes(collection.id))
          error(`${name} isn't on the campaign's collection.`);
      }
      if (discount.kind === "app") {
        const expected = discountConfig(entry, collection, products);
        if ("error" in expected) error(`${name}: ${expected.error}.`);
        else if (!sameConfig(discount.config, expected.config))
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
    if (findings.every((finding) => finding.level !== "error"))
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
      : `${rules.free} free in ${rules.buy}`;
