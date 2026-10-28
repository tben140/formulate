import { describe, expect, it } from "vitest";

import { PLANNED_PAYMENT_ICON_IDS, paymentIconIds } from "./payment-icons";

describe("paymentIconIds", () => {
  it("shows the store's methods, cards before wallets, in a fixed order", () => {
    expect(
      paymentIconIds({
        acceptedCardBrands: ["MASTERCARD", "VISA"],
        supportedDigitalWallets: ["SHOPIFY_PAY", "APPLE_PAY"],
      }),
    ).toEqual(["visa", "master", "apple_pay", "shopify_pay"]);
  });

  it("shows Google Pay once, whichever name Shopify uses", () => {
    expect(
      paymentIconIds({
        acceptedCardBrands: [],
        supportedDigitalWallets: ["ANDROID_PAY", "GOOGLE_PAY"],
      }),
    ).toEqual(["google_pay"]);
  });

  it("skips methods it has no icon for", () => {
    expect(
      paymentIconIds({
        acceptedCardBrands: ["VISA", "JCB"],
        supportedDigitalWallets: [],
      }),
    ).toEqual(["visa"]);
  });

  it("shows nothing, not the planned methods, when none it reports has an icon", () => {
    expect(
      paymentIconIds({ acceptedCardBrands: ["JCB"], supportedDigitalWallets: [] }),
    ).toEqual([]);
  });

  it("falls back to the planned methods while Shopify reports none", () => {
    expect(paymentIconIds({ acceptedCardBrands: [], supportedDigitalWallets: [] })).toBe(
      PLANNED_PAYMENT_ICON_IDS,
    );
    expect(paymentIconIds(null)).toBe(PLANNED_PAYMENT_ICON_IDS);
  });
});
