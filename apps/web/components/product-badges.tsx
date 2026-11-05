import type { BadgeTone, ShownBadge } from "@formulate/shopify";

/** Token-backed colours, each at least 4.5:1 for the small text. */
const TONE: Readonly<Record<BadgeTone, string>> = {
  brand: "bg-brand-700 text-surface",
  sale: "bg-danger text-surface",
  new: "bg-success text-surface",
  neutral: "bg-ink-800 text-surface",
};

/**
 * A product's badges (SHO-202): a live campaign's first, then the shop's
 * badges by priority, from `productBadges`. Text, never colour alone, so a
 * screen reader reads them with the card. The theme's
 * snippets/product-badges.liquid and the app's ProductBadges match.
 */
export const ProductBadges = ({ badges }: { readonly badges: readonly ShownBadge[] }) =>
  badges.length === 0 ? null : (
    <span className="flex flex-wrap gap-1">
      {badges.map((badge) => (
        <span
          key={badge.label}
          className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${TONE[badge.tone]}`}
        >
          {badge.label}
        </span>
      ))}
    </span>
  );
