import { describe, expect, it } from "vitest";

import live from "./fixtures/black-friday.json";
import { duplicateFields, previewOffer } from "./offer-preview";
import type { Snapshot } from "./types";

const snapshot = live as unknown as Snapshot;
const costed: Snapshot = {
  ...snapshot,
  products: snapshot.products.map((product) => ({
    ...product,
    variants: product.variants.map((variant) => ({
      ...variant,
      cost: (Number(variant.price) * 0.5).toFixed(2),
    })),
  })),
};

describe("previewOffer", () => {
  it("refuses rules the Function would ignore", () => {
    const preview = previewOffer(snapshot, '{"type":"percent","percent":150}');
    expect(preview.valid).toBe(false);
  });

  it("writes the terms and the worst margins", () => {
    const preview = previewOffer(costed, '{"type":"percent","percent":40}');
    expect(preview.valid).toBe(true);
    if (!preview.valid) return;
    expect(preview.words).toContain("40%");
    expect(preview.terms).toContain("40%");
    // 40% off leaves 0.6 of the price; a cost of half the price is a 16.7% margin.
    expect(preview.lowest[0]?.margin).toBeCloseTo(16.7, 1);
    expect(preview.underFloor).toBe(preview.variants);
    expect(preview.withoutCost).toBe(0);
  });

  it("counts variants it can't check for want of a cost", () => {
    const preview = previewOffer(snapshot, '{"type":"percent","percent":20}');
    expect(preview.valid && preview.withoutCost).toBe(
      preview.valid ? preview.variants : false,
    );
  });
});

describe("duplicateFields", () => {
  const starts = new Date("2027-11-26T00:00:00Z");
  const ends = new Date("2027-11-30T00:00:00Z");
  const entry = {
    ...snapshot.entry,
    fields: {
      ...snapshot.entry.fields,
      approved_by: "Ben",
      approved_at: "2026-11-20T10:00:00Z",
      offer_rules: '{"type":"percent","percent":25}',
    },
  };

  it("drops the sign-off and collection, and takes the new dates", () => {
    const fields = Object.fromEntries(
      duplicateFields(entry, starts, ends).map((f) => [f.key, f.value]),
    );
    expect(fields.approved_by).toBeUndefined();
    expect(fields.collection).toBeUndefined();
    expect(fields.starts_at).toBe(starts.toISOString());
    expect(fields.ends_at).toBe(ends.toISOString());
    expect(fields.title).toBe(snapshot.entry.fields.title);
  });

  it("rewrites the terms for the new dates when the offer has rules", () => {
    const terms = duplicateFields(entry, starts, ends).find(
      (f) => f.key === "terms",
    )?.value;
    expect(terms).toContain("2027");
    expect(terms).not.toContain("2026");
  });
});
