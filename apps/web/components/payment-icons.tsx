import { PaymentSettingsQuery, payLaterIds, paymentIconIds } from "@formulate/shopify";
import { PAYMENT_ICONS } from "@formulate/tokens/payment";

import { storefront } from "@/lib/storefront";

/**
 * The payment methods the store accepts, as icons in the footer. Shopify says
 * which (paymentIconIds); until Shopify Payments is set up it reports none,
 * and the planned methods show instead. Klarna and Clearpay come from the
 * shop's `double_helix.pay_later` metafield (docs/integration-pay-later.md). Icons are Shopify's own set, shared
 * with the app and the theme (packages/tokens/src/payment.ts).
 */
export const PaymentIcons = async () => {
  const result = await storefront.request(PaymentSettingsQuery, {});
  const shop = result.ok ? result.data.shop : null;
  const ids = paymentIconIds(shop?.paymentSettings, payLaterIds(shop?.payLater?.value));
  const icons = PAYMENT_ICONS.filter((icon) => ids.includes(icon.id));

  return (
    <ul aria-label="Payment methods" className="flex flex-wrap gap-2">
      {icons.map((icon) => (
        <li key={icon.id}>
          <svg
            role="img"
            aria-label={icon.label}
            viewBox={icon.viewBox}
            className="h-6 w-[38px]"
            // Static markup from Shopify's icon set, not shopper input.
            dangerouslySetInnerHTML={{ __html: icon.markup }}
          />
        </li>
      ))}
    </ul>
  );
};
