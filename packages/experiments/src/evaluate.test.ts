import { randomUUID } from "node:crypto";

import type { FeatureApiResponse } from "@growthbook/growthbook";
import { describe, expect, it } from "vitest";

import { assign, parseExperimentId, parsePayload, payloadUrl } from "./evaluate";
import { EXPERIMENTS } from "./experiments";

const aa = EXPERIMENTS.productPageAa;

/** The shape GrowthBook's CDN serves for a feature with a 50/50 experiment rule. */
const payload = (overrides: Record<string, unknown> = {}): FeatureApiResponse => ({
  features: {
    [aa.key]: {
      defaultValue: "control",
      rules: [
        {
          key: "product-page-aa-2026-11",
          variations: ["control", "control-copy"],
          weights: [0.5, 0.5],
          coverage: 1,
          hashAttribute: "id",
          hashVersion: 2,
          meta: [{ key: "0" }, { key: "1" }],
          ...overrides,
        },
      ],
    },
  },
});

describe("assign", () => {
  it("splits evenly: within 2 points of 50/50 over 10,000 visitors", async () => {
    const live = payload();
    const counts = { control: 0, "control-copy": 0 };
    for (let i = 0; i < 10_000; i++) {
      const { variant } = await assign(aa, { payload: live, id: randomUUID() });
      counts[variant]++;
    }
    expect(counts.control).toBeGreaterThan(4_800);
    expect(counts.control).toBeLessThan(5_200);
  });

  it("gives the same visitor the same variant every time", async () => {
    const live = payload();
    const id = randomUUID();
    const first = await assign(aa, { payload: live, id });
    for (let i = 0; i < 20; i++) {
      expect(await assign(aa, { payload: payload(), id })).toEqual(first);
    }
  });

  it("records the tracking key and the variation key", async () => {
    const result = await assign(aa, { payload: payload(), id: randomUUID() });
    expect(result.exposure?.experiment_key).toBe("product-page-aa-2026-11");
    expect(["0", "1"]).toContain(result.exposure?.variation_id);
    expect(result.variant).toBe(
      result.exposure?.variation_id === "0" ? "control" : "control-copy",
    );
  });

  it("shows the control and records nothing without an id (no consent)", async () => {
    expect(await assign(aa, { payload: payload(), id: null })).toEqual({
      variant: "control",
      exposure: null,
    });
  });

  it("shows the control and records nothing without a payload", async () => {
    expect(await assign(aa, { payload: null, id: randomUUID() })).toEqual({
      variant: "control",
      exposure: null,
    });
  });

  it("records nothing for a visitor outside the coverage", async () => {
    const result = await assign(aa, {
      payload: payload({ coverage: 0 }),
      id: randomUUID(),
    });
    expect(result).toEqual({ variant: "control", exposure: null });
  });

  it("shows the control when the feature isn't in the payload", async () => {
    const result = await assign(aa, { payload: { features: {} }, id: randomUUID() });
    expect(result).toEqual({ variant: "control", exposure: null });
  });

  it("shows the control for a value the app doesn't know", async () => {
    const result = await assign(aa, {
      payload: payload({ variations: ["control", "typo"], weights: [0, 1] }),
      id: randomUUID(),
    });
    expect(result).toEqual({ variant: "control", exposure: null });
  });

  it("shows a forced variant and records nothing", async () => {
    for (const id of [randomUUID(), null]) {
      expect(
        await assign(aa, { payload: payload(), id, forced: "control-copy" }),
      ).toEqual({
        variant: "control-copy",
        exposure: null,
      });
    }
  });

  it("ignores a forced value that isn't a variant", async () => {
    const result = await assign(aa, { payload: null, id: null, forced: "<script>" });
    expect(result.variant).toBe("control");
  });
});

describe("parseExperimentId", () => {
  it("accepts a UUID, lower-cased", () => {
    expect(parseExperimentId("0F8FAD5B-D9CB-469F-A165-70867728950E")).toBe(
      "0f8fad5b-d9cb-469f-a165-70867728950e",
    );
  });

  it("refuses anything else", () => {
    for (const value of [
      undefined,
      null,
      "",
      "abc",
      "0f8fad5b-d9cb-469f-a165-70867728950e;x",
    ]) {
      expect(parseExperimentId(value)).toBeNull();
    }
  });
});

describe("parsePayload and payloadUrl", () => {
  it("accepts a features object and refuses anything else", () => {
    expect(parsePayload({ features: {} })).toEqual({ features: {} });
    for (const body of [null, "x", {}, { features: null }, { status: 400 }]) {
      expect(parsePayload(body)).toBeNull();
    }
  });

  it("escapes the key into the CDN URL", () => {
    expect(payloadUrl("sdk-abc/../x")).toBe(
      "https://cdn.growthbook.io/api/features/sdk-abc%2F..%2Fx",
    );
  });
});
