import { describe, expect, it } from "vitest";

import { PLANNED_PAYMENT_ICON_IDS, payLaterIds, paymentIconIds } from "./payment-icons";

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

describe("pay later", () => {
  it("adds Klarna and Clearpay after the cards and wallets, in a fixed order", () => {
    expect(
      paymentIconIds(
        { acceptedCardBrands: ["VISA"], supportedDigitalWallets: ["APPLE_PAY"] },
        ["clearpay", "klarna"],
      ),
    ).toEqual(["visa", "apple_pay", "klarna", "clearpay"]);
  });

  it("adds them to the planned methods while Shopify reports none", () => {
    expect(paymentIconIds(null, ["klarna"])).toEqual([
      ...PLANNED_PAYMENT_ICON_IDS,
      "klarna",
    ]);
  });

  it("never plans them: they show only once the metafield lists them", () => {
    expect(PLANNED_PAYMENT_ICON_IDS).not.toContain("klarna");
    expect(PLANNED_PAYMENT_ICON_IDS).not.toContain("clearpay");
  });

  it("reads the metafield's list, ignoring anything it doesn't know", () => {
    expect(payLaterIds('["klarna","clearpay"]')).toEqual(["klarna", "clearpay"]);
    expect(payLaterIds('["Klarna","afterpay","clearpay",3]')).toEqual(["clearpay"]);
  });

  it("treats a missing or malformed metafield as none", () => {
    expect(payLaterIds(null)).toEqual([]);
    expect(payLaterIds(undefined)).toEqual([]);
    expect(payLaterIds("klarna")).toEqual([]);
    expect(payLaterIds('{"klarna":true}')).toEqual([]);
  });
});
