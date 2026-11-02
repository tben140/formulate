import { formatMoney, type MoneyLike } from "@formulate/shopify";
import { Text } from "react-native";

/**
 * A campaign price beside the normal one (SHO-169), as apps/web's OfferPrice.
 * The struck price is what the item sells for outside the campaign, so it's a
 * genuine comparison. Read as "Normally £24.95, Black Friday price £18.71".
 * `className` sizes it; the colours inherit nothing, so it reads on any card.
 */
export const OfferPrice = ({
  normal,
  offer,
  badge,
  className = "text-sm",
}: {
  readonly normal: MoneyLike;
  readonly offer: MoneyLike;
  readonly badge: string;
  readonly className?: string;
}) => (
  <Text
    className={`${className} text-foreground`}
    accessibilityLabel={`Normally ${formatMoney(normal)}, ${badge} price ${formatMoney(offer)}`}
  >
    <Text className="line-through">{formatMoney(normal)}</Text>{" "}
    <Text className="font-semibold text-brand-700">{formatMoney(offer)}</Text>
  </Text>
);

/** "Normally £24.95, Black Friday price £18.71", or the plain price. */
export const offerPriceLabel = (
  normal: MoneyLike,
  offer: MoneyLike | null,
  badge: string | null,
): string =>
  offer && badge
    ? `Normally ${formatMoney(normal)}, ${badge} price ${formatMoney(offer)}`
    : formatMoney(normal);
