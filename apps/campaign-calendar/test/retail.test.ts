import { describe, expect, it } from "vitest";

import { easterSunday, retailDays } from "../src/retail";

describe("retailDays", () => {
  it("finds Easter, and Mother's Day three weeks before it", () => {
    expect(easterSunday(2026)).toBe("2026-04-05");
    expect(easterSunday(2027)).toBe("2027-03-28");
    const days = retailDays(2026);
    expect(days.find((d) => d.name === "Mother's Day (UK)")?.date).toBe("2026-03-15");
  });

  it("puts Black Friday the day after the 4th Thursday of November", () => {
    const days = retailDays(2026);
    expect(days.find((d) => d.name === "Black Friday")?.date).toBe("2026-11-27");
    expect(days.find((d) => d.name === "Cyber Monday")?.date).toBe("2026-11-30");
    expect(retailDays(2027).find((d) => d.name === "Black Friday")?.date).toBe(
      "2027-11-26",
    );
  });

  it("puts Father's Day on the third Sunday of June", () => {
    expect(retailDays(2026).find((d) => d.name === "Father's Day (UK)")?.date).toBe(
      "2026-06-21",
    );
  });
});
