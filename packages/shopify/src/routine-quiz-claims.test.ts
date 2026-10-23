import { describe, expect, it } from "vitest";

import data from "../scripts/routine-quiz-data.json";

import { AUTHORISED_CLAIMS, authorisedClaimFor } from "./routine-quiz-claims";

const BANNED =
  /\b(cure|treat|prevent|boost|immunity|anxiety|detox|heal|protects? you)\b/i;

describe("authorised claims for quiz results", () => {
  it("picks the claim for the goal that put the product there", () => {
    expect(authorisedClaimFor("vitamin-c-zinc", ["immunity"])).toBe(
      "Vitamin C and zinc contribute to the normal function of the immune system.",
    );
    expect(authorisedClaimFor("vitamin-c-zinc", ["focus", "energy"])).toBe(
      "Vitamin C contributes to the reduction of tiredness and fatigue.",
    );
  });

  it("makes no claim for products that have none", () => {
    expect(authorisedClaimFor("citicoline", ["focus"])).toBeNull();
    expect(authorisedClaimFor("l-theanine", ["focus"])).toBeNull();
    expect(authorisedClaimFor("lions-mane-mushroom", ["focus"])).toBeNull();
  });

  it("only uses register-style wording, never banned terms", () => {
    for (const claims of Object.values(AUTHORISED_CLAIMS)) {
      for (const claim of Object.values(claims)) {
        expect(claim).toMatch(/\b(contributes?|increases)\b/);
        expect(claim).not.toMatch(BANNED);
      }
    }
  });

  it("only names goals and products the quiz has", () => {
    const goals = new Set(data.goals.map((goal) => goal.key));
    const products = new Set(data.goals.flatMap((goal) => goal.products));
    for (const [handle, claims] of Object.entries(AUTHORISED_CLAIMS)) {
      expect(products.has(handle)).toBe(true);
      for (const goal of Object.keys(claims)) expect(goals.has(goal)).toBe(true);
    }
  });
});
