import { describe, expect, it } from "vitest";

import { homeBenefits, homeSubheading } from "./home";

describe("home words", () => {
  it("states the saving only when a plan gives one", () => {
    expect(homeSubheading(15)).toContain("save 15%");
    expect(homeSubheading(null)).not.toMatch(/%/);
    expect(homeBenefits(15)[0]).toBe("Save 15% when you subscribe");
    expect(homeBenefits(null)[0]).toBe("Save when you subscribe");
  });

  it("names the free-delivery threshold without pence", () => {
    expect(homeBenefits(15)[1]).toMatch(/over £\d+$/);
  });
});
