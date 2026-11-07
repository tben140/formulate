import { describe, expect, it } from "vitest";

import { flag } from "./args";

describe("flag", () => {
  it("reads the value after the flag", () => {
    expect(flag(["x", "--segment", "at_risk", "--apply"], "segment")).toBe("at_risk");
  });

  it("is undefined when the flag isn't given", () => {
    expect(flag(["x", "--apply"], "segment")).toBeUndefined();
  });

  it("refuses a flag with no value rather than ignoring it", () => {
    expect(() => flag(["x", "--segment"], "segment")).toThrow("--segment needs a value.");
    expect(() => flag(["x", "--segment", "--apply"], "segment")).toThrow(
      "--segment needs a value.",
    );
  });
});
