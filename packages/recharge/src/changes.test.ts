import { describe, expect, it } from "vitest";

import {
  CANCEL_REASONS,
  changeDoneMessage,
  changeErrorMessage,
  isCancelReason,
  isoDateFrom,
} from "./changes";

describe("portal changes", () => {
  it("has a message for every change", () => {
    for (const action of [
      "skip",
      "unskip",
      "reschedule",
      "pause",
      "quantity",
      "cancel",
      "reactivate",
    ]) {
      expect(changeDoneMessage(action)).toMatch(/\.$/);
    }
    expect(changeDoneMessage("delete")).toBeNull();
  });

  it("never shows the Worker's reason code to the customer", () => {
    expect(changeErrorMessage("unauthorized")).toBe(
      "We couldn't make that change just now. Please try again in a moment.",
    );
    expect(changeErrorMessage("not-allowed")).toContain("isn't available");
  });

  it("knows the cancel reasons, and nothing else", () => {
    expect(CANCEL_REASONS.map((r) => r.value)).toContain("other");
    expect(isCancelReason("too-expensive")).toBe(true);
    expect(isCancelReason("because")).toBe(false);
  });

  it("counts days in UTC from a date or a moment", () => {
    expect(isoDateFrom("2026-11-05", 7)).toBe("2026-11-12");
    expect(isoDateFrom("2026-12-29", 7)).toBe("2027-01-05");
    expect(isoDateFrom(new Date("2026-10-20T23:30:00Z"), 1)).toBe("2026-10-21");
  });
});
