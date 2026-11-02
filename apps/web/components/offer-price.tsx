import { formatMoney, type MoneyLike } from "@formulate/shopify";

/**
 * A campaign price beside the normal one (SHO-169). The struck price is what
 * the item sells for today, outside the campaign, so it's a genuine comparison
 * (CMA pricing guidance). Screen readers hear "Normally £24.95, Black Friday
 * price £18.71" rather than two bare amounts.
 */
export const OfferPrice = ({
  normal,
  offer,
  badge,
}: {
  readonly normal: MoneyLike;
  readonly offer: MoneyLike;
  readonly badge: string;
}) => (
  <>
    {" "}
    {/* Inherits the colour: muted grey fails AA on the selected card. */}
    <s>
      <span className="sr-only">Normally </span>
      {formatMoney(normal)}
    </s>{" "}
    <span className="font-medium text-brand-700">
      <span className="sr-only">, {badge} price </span>
      {formatMoney(offer)}
    </span>
  </>
);
