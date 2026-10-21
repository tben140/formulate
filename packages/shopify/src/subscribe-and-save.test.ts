import { describe, expect, it } from "vitest";

import {
  deliveryPromise,
  isIntroductoryPlan,
  pricePerDay,
  renewalTerms,
  savingMessage,
  subscriptionSaving,
} from "./subscribe-and-save";

const gbp = (amount: string) => ({ amount, currencyCode: "GBP" });

describe("subscribe and save", () => {
  it("saves the difference against the one-time price, to the nearest percent", () => {
    const saving = subscriptionSaving(gbp("15.95"), gbp("13.56"));
    expect(saving).toEqual({ amount: gbp("2.39"), percent: 15 });
    expect(saving && savingMessage(saving)).toBe("Save £2.39 a delivery (15%)");
  });

  it("strikes nothing through when subscribing saves nothing, or can't be compared", () => {
    expect(subscriptionSaving(gbp("15.95"), gbp("15.95"))).toBeNull();
    expect(subscriptionSaving(gbp("15.95"), gbp("16.00"))).toBeNull();
    expect(
      subscriptionSaving(gbp("15.95"), { amount: "13.56", currencyCode: "USD" }),
    ).toBeNull();
    expect(subscriptionSaving(undefined, gbp("13.56"))).toBeNull();
  });

  it("gives the price per day of a 30-day supply, to the nearest penny", () => {
    expect(pricePerDay(gbp("13.56"))).toBe("45p a day");
    expect(pricePerDay(gbp("35.99"))).toBe("£1.20 a day");
    expect(pricePerDay({ amount: "29.99", currencyCode: "USD" })).toBe("US$1.00 a day");
    expect(pricePerDay(gbp("0"))).toBeNull();
  });

  it("states the renewal terms in full", () => {
    expect(renewalTerms(gbp("13.56"), "Delivery every 30 days")).toBe(
      "Delivery every 30 days: £13.56 is charged for each delivery, automatically, until you cancel. You can skip, pause or cancel any time from your account.",
    );
  });

  it("states both prices when the plan's price changes after the first delivery", () => {
    expect(renewalTerms(gbp("10.00"), "Delivery every 30 days", gbp("13.56"))).toBe(
      "Delivery every 30 days: £10.00 for an introductory period, then £13.56 for each delivery after that (checkout shows exactly when it changes), charged automatically until you cancel. You can skip, pause or cancel any time from your account.",
    );
    // The same price again is no change.
    expect(renewalTerms(gbp("13.56"), "Plan", gbp("13.56"))).toContain(
      "£13.56 is charged for each delivery",
    );
  });

  it("spots a plan whose price changes after an introductory period", () => {
    expect(isIntroductoryPlan([{ price: gbp("10.00") }, { price: gbp("13.56") }])).toBe(
      true,
    );
    expect(isIntroductoryPlan([{ price: gbp("13.56") }, { price: gbp("13.56") }])).toBe(
      false,
    );
    expect(isIntroductoryPlan([{ price: gbp("13.56") }])).toBe(false);
  });

  it("names the free-delivery threshold from the shared constant", () => {
    expect(deliveryPromise()).toBe(
      "Free UK delivery on subscriptions, and on orders over £40.00",
    );
  });
});
