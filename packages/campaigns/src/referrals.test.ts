import { describe, expect, it } from "vitest";

import { earnedRewards, planReferralCodes } from "./referrals";

describe("referrals", () => {
  it("gives buyers without a code a new one, and keeps existing codes", () => {
    const plan = planReferralCodes(
      [
        { customerId: "c1", email: "a@x.co", code: "REF-AAAAAAAA" },
        { customerId: "c2", email: "b@x.co", code: null },
        { customerId: "c3", email: null, code: null },
      ],
      (n) => Array.from({ length: n }, (_, i) => `REF-NEW${i}`),
    );
    expect(plan).toEqual([
      { customerId: "c2", email: "b@x.co", code: "REF-NEW0" },
      { customerId: "c3", email: null, code: "REF-NEW1" },
    ]);
  });

  it("credits referrers, not people using their own code", () => {
    const owners = new Map([
      ["REF-AAAAAAAA", "c1"],
      ["REF-BBBBBBBB", "c2"],
    ]);
    expect(
      earnedRewards(
        [
          { order: "#1001", code: "ref-aaaaaaaa", friendCustomerId: "f1" },
          { order: "#1002", code: "REF-AAAAAAAA", friendCustomerId: "f2" },
          { order: "#1003", code: "REF-BBBBBBBB", friendCustomerId: "c2" },
          { order: "#1004", code: "REF-ZZZZZZZZ", friendCustomerId: "f3" },
        ],
        owners,
      ),
    ).toEqual([{ referrer: "c1", orders: ["#1001", "#1002"] }]);
  });
});
