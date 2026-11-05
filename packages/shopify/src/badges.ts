/**
 * Product badges (SHO-202): "Best seller", "New", "Subscription only" and
 * whatever else the merchant defines, as `badge` metaobjects in Shopify. A
 * live campaign's badge (SHO-169) is one more source and always leads.
 *
 * One rule for every surface: web and the app call `productBadges`, and the
 * theme repeats it in snippets/product-badges.liquid.
 *
 * A badge applies to a product by its `rule`:
 * - `manual`: the product lists it in `double_helix.badges`;
 * - `new`: published in the last `rule_value` days (30 if unset);
 * - `tag`: the product has the tag in `rule_value`;
 * - `subscription_only`: the product can only be bought by subscription.
 *
 * Low stock isn't a rule: the Storefront token can't read inventory
 * (`unauthenticated_read_product_inventory`), so web and the app couldn't
 * agree with the theme.
 */

/** How a badge looks: each maps to one token-backed colour pair. */
export type BadgeTone = "brand" | "sale" | "new" | "neutral";

export const BADGE_TONES: readonly BadgeTone[] = ["brand", "sale", "new", "neutral"];

export type BadgeRule =
  | { readonly kind: "manual" }
  | { readonly kind: "new"; readonly days: number }
  | { readonly kind: "tag"; readonly tag: string }
  | { readonly kind: "subscription_only" };

export interface Badge {
  readonly handle: string;
  readonly label: string;
  readonly tone: BadgeTone;
  readonly rule: BadgeRule;
  /** Higher first. */
  readonly priority: number;
  readonly startsAt: Date | null;
  readonly endsAt: Date | null;
}

/** A badge as shown: what it says and how it looks. */
export interface ShownBadge {
  readonly label: string;
  readonly tone: BadgeTone;
}

interface FieldValue {
  readonly value?: string | null;
}

/** A `badge` metaobject as BadgeFields (queries.ts) selects it. */
export interface BadgeNode {
  readonly handle: string;
  readonly label?: FieldValue | null;
  readonly tone?: FieldValue | null;
  readonly rule?: FieldValue | null;
  readonly ruleValue?: FieldValue | null;
  readonly priority?: FieldValue | null;
  readonly startsAt?: FieldValue | null;
  readonly endsAt?: FieldValue | null;
}

/** What a product brings to the rule, as ProductBadgeFields selects it. */
export interface BadgeProduct {
  readonly publishedAt?: string | null;
  readonly tags?: readonly string[] | null;
  readonly requiresSellingPlan?: boolean | null;
  readonly chosenBadges?: {
    readonly references?: { readonly nodes?: readonly unknown[] | null } | null;
  } | null;
}

/** How many badges a card shows; the product page shows the same. */
export const MAX_BADGES = 2;

const DEFAULT_NEW_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

const text = (field: FieldValue | null | undefined): string | null => {
  const value = field?.value?.trim();
  return value ? value : null;
};

const date = (field: FieldValue | null | undefined): Date | null => {
  const value = text(field);
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const toRule = (rule: string | null, value: string | null): BadgeRule | null => {
  switch (rule) {
    case "manual":
      return { kind: "manual" };
    case "subscription_only":
      return { kind: "subscription_only" };
    case "new": {
      const days = Number.parseInt(value ?? "", 10);
      return { kind: "new", days: days > 0 ? days : DEFAULT_NEW_DAYS };
    }
    case "tag":
      return value ? { kind: "tag", tag: value } : null;
    default:
      return null;
  }
};

/** A badge from its metaobject, or null when it has no label or a rule we can't apply. */
export const toBadge = (node: BadgeNode | null | undefined): Badge | null => {
  if (!node?.handle) return null;
  const label = text(node.label);
  const rule = toRule(text(node.rule), text(node.ruleValue));
  if (!label || !rule) return null;
  const tone = text(node.tone);
  return {
    handle: node.handle,
    label,
    tone: BADGE_TONES.find((t) => t === tone) ?? "brand",
    rule,
    priority: Number.parseInt(text(node.priority) ?? "", 10) || 0,
    startsAt: date(node.startsAt),
    endsAt: date(node.endsAt),
  };
};

/** The badges that can apply at all, from a list of metaobjects. */
export const toBadges = (nodes: readonly (BadgeNode | null | undefined)[]): Badge[] =>
  nodes.map(toBadge).filter((badge): badge is Badge => badge !== null);

const inDates = (badge: Badge, now: Date) =>
  (!badge.startsAt || badge.startsAt <= now) && (!badge.endsAt || now < badge.endsAt);

const applies = (
  badge: Badge,
  product: BadgeProduct,
  chosen: ReadonlySet<string>,
  now: Date,
) => {
  switch (badge.rule.kind) {
    case "manual":
      return chosen.has(badge.handle);
    case "subscription_only":
      return product.requiresSellingPlan === true;
    case "tag": {
      const tag = badge.rule.tag.toLowerCase();
      return (product.tags ?? []).some((t) => t.toLowerCase() === tag);
    }
    case "new": {
      const published = product.publishedAt ? new Date(product.publishedAt) : null;
      if (!published || Number.isNaN(published.getTime())) return false;
      const age = now.getTime() - published.getTime();
      return age >= 0 && age < badge.rule.days * DAY;
    }
  }
};

/**
 * A product's badges, best first: the live campaign's (if any), then every
 * badge whose rule matches and whose dates include `now`, by priority and
 * then label. At most MAX_BADGES, and never the same label twice.
 *
 * `badges` are the rule badges (every `badge` metaobject); a manual badge is
 * also matched when the product lists it, even if it isn't in that list.
 */
export const productBadges = (
  product: BadgeProduct,
  badges: readonly Badge[],
  now: Date,
  campaignLabel?: string | null,
  max: number = MAX_BADGES,
): ShownBadge[] => {
  const listed = toBadges((product.chosenBadges?.references?.nodes ?? []) as BadgeNode[]);
  const chosen = new Set(listed.map((badge) => badge.handle));
  const byHandle = new Map<string, Badge>();
  for (const badge of [...badges, ...listed]) byHandle.set(badge.handle, badge);

  const matching = [...byHandle.values()]
    .filter((badge) => inDates(badge, now) && applies(badge, product, chosen, now))
    .sort((a, b) => b.priority - a.priority || a.label.localeCompare(b.label));

  const shown: ShownBadge[] = campaignLabel
    ? [{ label: campaignLabel, tone: "brand" }]
    : [];
  for (const badge of matching) {
    if (shown.length >= max) break;
    if (shown.some((s) => s.label === badge.label)) continue;
    shown.push({ label: badge.label, tone: badge.tone });
  }
  return shown.slice(0, max);
};
