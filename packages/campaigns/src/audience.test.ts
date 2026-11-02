import { describe, expect, it } from "vitest";

import { lapsedCustomers } from "./audience";

describe("lapsedCustomers", () => {
  const since = new Date("2026-05-01T00:00:00Z");

  it("finds customers whose every subscription is cancelled, lately", () => {
    expect(
      lapsedCustomers(
        [
          { customerId: 1, cancelledAt: "2026-09-14T10:02:11" },
          { customerId: 2, cancelledAt: "2026-03-01T00:00:00" },
          { customerId: 3, cancelledAt: "2026-10-01T00:00:00+00:00" },
          { customerId: 3, cancelledAt: "2025-01-01T00:00:00" },
          { customerId: 4, cancelledAt: null },
        ],
        new Set([3]),
        since,
      ),
    ).toEqual([1]);
  });

  it("goes by the last cancellation", () => {
    expect(
      lapsedCustomers(
        [
          { customerId: 5, cancelledAt: "2026-01-01T00:00:00" },
          { customerId: 5, cancelledAt: "2026-06-01T00:00:00" },
        ],
        new Set(),
        since,
      ),
    ).toEqual([5]);
  });
});
