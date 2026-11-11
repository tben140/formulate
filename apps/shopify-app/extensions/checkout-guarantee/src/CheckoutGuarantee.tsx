import "@shopify/ui-extensions/preact";
import { render } from "preact";

import { GUARANTEE_DETAIL, GUARANTEE_TITLE } from "../../../shared/guarantee";

/**
 * The 30-day money-back guarantee, at checkout, where a first-time buyer
 * decides. Wording from shared/guarantee.ts (the storefronts' words) unless the merchant
 * overrides it in the checkout editor; either way it must match the refund
 * policy, which is what it promises.
 */
export default async () => {
  render(<CheckoutGuarantee />, document.body);
};

const CheckoutGuarantee = () => {
  const heading = String(shopify.settings.value.heading ?? "").trim() || GUARANTEE_TITLE;
  const text = String(shopify.settings.value.text ?? "").trim() || GUARANTEE_DETAIL;
  return (
    <s-box padding="base" border="base" borderRadius="base">
      <s-stack direction="inline" gap="small-200" alignItems="start">
        <s-icon type="check-circle" tone="success" />
        <s-stack gap="small-500">
          <s-text type="strong">{heading}</s-text>
          <s-text color="subdued">{text}</s-text>
        </s-stack>
      </s-stack>
    </s-box>
  );
};
