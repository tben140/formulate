import { describe, expect, it } from "vitest";

import { productBadges, toBadge, toBadges, type BadgeNode } from "./badges";

const field = (value: string) => ({ value });
const node = (handle: string, fields: Record<string, string>): BadgeNode => ({
  handle,
  label: fields.label ? field(fields.label) : null,
  tone: fields.tone ? field(fields.tone) : null,
  rule: fields.rule ? field(fields.rule) : null,
  ruleValue: fields.ruleValue ? field(fields.ruleValue) : null,
  priority: fields.priority ? field(fields.priority) : null,
  startsAt: fields.startsAt ? field(fields.startsAt) : null,
  endsAt: fields.endsAt ? field(fields.endsAt) : null,
});

const now = new Date("2026-11-10T12:00:00Z");
const bestSeller = node("best-seller", {
  label: "Best seller",
  rule: "tag",
  ruleValue: "bestseller",
  priority: "10",
});
const fresh = node("new", {
  label: "New",
  tone: "new",
  rule: "new",
  ruleValue: "30",
  priority: "20",
});
const subOnly = node("sub", {
  label: "Subscription only",
  tone: "neutral",
  rule: "subscription_only",
});
const vegan = node("vegan", {
  label: "Vegan",
  tone: "neutral",
  rule: "manual",
  priority: "1",
});
const rules = toBadges([bestSeller, fresh, subOnly]);

describe("toBadge", () => {
  it("reads a badge, defaulting the tone and the days", () => {
    expect(toBadge(node("n", { label: "New", rule: "new" }))).toMatchObject({
      tone: "brand",
      rule: { kind: "new", days: 30 },
      priority: 0,
    });
  });

  it("drops a badge with no label, an unknown rule, or a tag rule with no tag", () => {
    expect(toBadge(node("a", { rule: "manual" }))).toBeNull();
    expect(toBadge(node("b", { label: "Hot", rule: "low_stock" }))).toBeNull();
    expect(toBadge(node("c", { label: "Hot", rule: "tag" }))).toBeNull();
  });
});

describe("productBadges", () => {
  it("matches tags case-insensitively, and orders by priority", () => {
    const product = { tags: ["BestSeller"], publishedAt: "2026-11-01T00:00:00Z" };
    expect(productBadges(product, rules, now)).toEqual([
      { label: "New", tone: "new" },
      { label: "Best seller", tone: "brand" },
    ]);
  });

  it("stops being new after the rule's days", () => {
    expect(productBadges({ publishedAt: "2026-09-01T00:00:00Z" }, rules, now)).toEqual(
      [],
    );
  });

  it("badges subscription-only products", () => {
    expect(productBadges({ requiresSellingPlan: true }, rules, now)).toEqual([
      { label: "Subscription only", tone: "neutral" },
    ]);
  });

  it("shows a manual badge only on products that list it", () => {
    const listing = { chosenBadges: { references: { nodes: [vegan] } } };
    expect(productBadges(listing, rules, now)).toEqual([
      { label: "Vegan", tone: "neutral" },
    ]);
    expect(productBadges({}, toBadges([vegan]), now)).toEqual([]);
  });

  it("puts a live campaign first, and shows at most two", () => {
    const product = {
      tags: ["bestseller"],
      publishedAt: "2026-11-01T00:00:00Z",
      requiresSellingPlan: true,
    };
    expect(productBadges(product, rules, now, "Black Friday")).toEqual([
      { label: "Black Friday", tone: "brand" },
      { label: "New", tone: "new" },
    ]);
  });

  it("respects a badge's dates", () => {
    const dated = toBadges([
      node("xmas", {
        label: "Christmas pick",
        rule: "tag",
        ruleValue: "gift",
        startsAt: "2026-12-01T00:00:00Z",
      }),
    ]);
    expect(productBadges({ tags: ["gift"] }, dated, now)).toEqual([]);
    expect(
      productBadges({ tags: ["gift"] }, dated, new Date("2026-12-02T00:00:00Z")),
    ).toEqual([{ label: "Christmas pick", tone: "brand" }]);
  });

  it("never shows the same label twice", () => {
    const twice = toBadges([
      bestSeller,
      node("bs2", { label: "Best seller", rule: "tag", ruleValue: "top" }),
    ]);
    expect(productBadges({ tags: ["bestseller", "top"] }, twice, now)).toEqual([
      { label: "Best seller", tone: "brand" },
    ]);
  });
});
