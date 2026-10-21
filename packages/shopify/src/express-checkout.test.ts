import { describe, expect, it } from "vitest";

import { cartRenewalTerms, expressCheckoutOnProduct } from "./express-checkout";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });
const line = (title: string, amount: string, plan?: string) => ({
  sellingPlanAllocation: plan ? { sellingPlan: { name: plan } } : null,
  cost: { totalAmount: gbp(amount) },
  merchandise: { product: { title } },
});

describe("express checkout", () => {
  it("is offered on product pages for one-time purchases only", () => {
    expect(expressCheckoutOnProduct("")).toBe(true);
    expect(expressCheckoutOnProduct("gid://shopify/SellingPlan/1")).toBe(false);
  });

  it("states the renewal terms for every subscription in the cart", () => {
    expect(
      cartRenewalTerms([
        line("Whey Protein", "24.95"),
        line("Daily Multivitamin", "40.68", "90 day subscription with 15% discount"),
        line("Magnesium", "11.01", "30 day subscription with 15% discount"),
      ]),
    ).toBe(
      "Subscriptions in this order renew automatically until you cancel: Daily Multivitamin (90 day subscription with 15% discount), £40.68 a delivery; Magnesium (30 day subscription with 15% discount), £11.01 a delivery. You can skip, pause or cancel any time from your account.",
    );
  });

  it("says nothing for a cart with no subscription", () => {
    expect(cartRenewalTerms([line("Whey Protein", "24.95")])).toBeNull();
    expect(cartRenewalTerms([])).toBeNull();
  });
});
