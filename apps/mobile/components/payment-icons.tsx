import { PLANNED_PAYMENT_ICON_IDS } from "@formulate/shopify";
import { PAYMENT_ICONS } from "@formulate/tokens/payment";
import { View } from "react-native";
import { SvgXml } from "react-native-svg";

import { usePaymentIconIds } from "../lib/queries";

/**
 * The payment methods the store accepts, as icons in the footer, matching web
 * and the theme. Shopify says which; until Shopify Payments is set up it
 * reports none and the planned methods show, which is also what shows while
 * the answer loads or if it fails. Icons are Shopify's own set, shared with
 * web and the theme (packages/tokens/src/payment.ts).
 */
export const PaymentIcons = () => {
  const { data: ids = PLANNED_PAYMENT_ICON_IDS } = usePaymentIconIds();
  const icons = PAYMENT_ICONS.filter((icon) => ids.includes(icon.id));

  return (
    <View className="flex-row flex-wrap gap-2" accessibilityLabel="Payment methods">
      {icons.map((icon) => (
        <View
          key={icon.id}
          accessible
          accessibilityRole="image"
          accessibilityLabel={icon.label}
        >
          <SvgXml
            xml={`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${icon.viewBox}">${icon.markup}</svg>`}
            width={38}
            height={24}
          />
        </View>
      ))}
    </View>
  );
};
