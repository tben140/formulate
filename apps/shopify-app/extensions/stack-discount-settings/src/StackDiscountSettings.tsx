import "@shopify/ui-extensions/preact";
import { render } from "preact";
import { useEffect, useState } from "preact/hooks";

/**
 * "Build your stack" on Shopify's Discounts page.
 *
 * Nothing to configure yet: the rule lives in the Function
 * (extensions/stack-discount: STACK_SIZE, STACK_PERCENT). The panel says what
 * the discount does, and makes sure it's an **order** discount, the only
 * class the Function acts on. Combinations (with codes, with shipping) are
 * Shopify's own controls on the same page.
 */
export default async () => {
  render(<StackDiscountSettings />, document.body);
};

const StackDiscountSettings = () => {
  const discounts = shopify.discounts;
  const classes = discounts.discountClasses.value;

  const [classError, setClassError] = useState<string | null>(null);

  useEffect(() => {
    if (classes.length === 1 && classes[0] === "order") return;
    const result = discounts.updateDiscountClasses(["order"]);
    // Saved as anything but an order discount, the Function returns nothing,
    // so a failure here must be visible rather than silent.
    setClassError(
      result.success
        ? null
        : "Couldn't set this to an order discount. Choose “Order” as the discount class before saving.",
    );
  }, [classes.join()]);

  return (
    // Nothing to save: the Function holds the rule, and Shopify saves the
    // discount itself.
    <s-function-settings onSubmit={(event) => event.waitUntil?.(Promise.resolve())}>
      <s-heading>Build your stack</s-heading>
      <s-section>
        <s-stack gap="base">
          {classError ? <s-banner tone="critical">{classError}</s-banner> : null}
          <s-paragraph>
            10% off one-off items when an order has 3 or more different products.
          </s-paragraph>
          <s-paragraph>
            Subscriptions count towards the three but aren&apos;t discounted again: they
            already have their subscribe-and-save price. Two sizes of one product count
            once.
          </s-paragraph>
          <s-paragraph color="subdued">
            Applied as an order discount. The rule is set in code
            (apps/shopify-app/extensions/stack-discount).
          </s-paragraph>
        </s-stack>
      </s-section>
    </s-function-settings>
  );
};
