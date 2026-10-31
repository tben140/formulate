import { describe, expect, it } from "vitest";

import { checkCampaign } from "./check";
import { CODE_LENGTH, generateCodes, isPersonalPool } from "./codes";
import live from "./fixtures/black-friday.json";
import { discountConfig } from "./sync";
import type { Snapshot } from "./types";

describe("generateCodes", () => {
  it("makes distinct codes from the unambiguous alphabet", () => {
    const codes = generateCodes(500, "BF");
    expect(new Set(codes).size).toBe(500);
    for (const code of codes)
      expect(code).toMatch(new RegExp(`^BF-[A-HJKMNP-Z2-9]{${CODE_LENGTH}}$`));
  });

  it("refuses bad prefixes and counts", () => {
    expect(() => generateCodes(10, "bf")).toThrow();
    expect(() => generateCodes(0, "BF")).toThrow();
    expect(() => generateCodes(20001, "BF")).toThrow();
  });

  it("keeps drawing until the codes are distinct", () => {
    let n = 0;
    // The first two draws collide, the third differs.
    const pick = () => (n++ < 2 * CODE_LENGTH ? 0 : 1);
    expect(generateCodes(2, "X")).toHaveLength(2);
    expect(generateCodes(2, "X", pick)).toEqual(["X-AAAAAAAA", "X-BBBBBBBB"]);
  });
});

describe("the personal-code pool in check", () => {
  it("isn't mistaken for the main discount, or for an out-of-date config", () => {
    const snapshot = live as unknown as Snapshot;
    const result = discountConfig(snapshot.entry, snapshot.collection, snapshot.products);
    if (!("config" in result)) throw new Error(result.error);
    const pool = {
      id: "gid://shopify/DiscountCodeNode/9",
      title: "Black Friday 2026 (personal codes)",
      kind: "app" as const,
      method: "code" as const,
      status: "SCHEDULED",
      startsAt: "2026-11-27T00:00:00Z",
      endsAt: "2026-12-01T00:00:00Z",
      percent: null,
      appliesOnOneTimePurchase: null,
      appliesOnSubscription: null,
      collectionIds: [],
      config: { ...result.config, pool: "personal" },
      codes: ["BF-ABCDEFGH"],
    };
    expect(isPersonalPool(pool.config)).toBe(true);
    const findings = checkCampaign(
      { ...snapshot, discounts: [...snapshot.discounts, pool] },
      new Date("2026-11-01T12:00:00Z"),
    );
    const about = findings.filter((f) => f.message.includes("personal codes"));
    expect(about.filter((f) => f.level === "error")).toEqual([]);
  });
});
