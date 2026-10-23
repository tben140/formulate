/**
 * The authorised claim beside each quiz result (docs/claims-wording.md).
 *
 * "Energy", "Everyday health" and "Immunity" refer to general benefits, and in
 * Great Britain those may only appear alongside a specific authorised claim
 * (retained Regulation 1924/2006, Article 10(3)). So each result shows the
 * register's wording for the goal that put it there, or nothing at all.
 *
 * ⚠️ CANDIDATE wording. Every formula is still a draft, and most claims need
 * a significant amount of the nutrient per daily portion (omega-3: 250 mg
 * EPA + DHA; creatine: 3 g). Verify each against the GB register and the
 * final formula before this goes live. Products without an entry make no
 * claim: their copy stays factual.
 *
 * Keyed by product handle, then goal key. Kept in code, reviewed in PRs, until
 * the claims library moves to Sanity (SHO-178).
 */
export const AUTHORISED_CLAIMS: Readonly<
  Record<string, Readonly<Partial<Record<string, string>>>>
> = {
  "magnesium-glycinate": {
    energy: "Magnesium contributes to a reduction of tiredness and fatigue.",
    focus: "Magnesium contributes to normal psychological function.",
  },
  "vitamin-c-zinc": {
    energy: "Vitamin C contributes to the reduction of tiredness and fatigue.",
    immunity:
      "Vitamin C and zinc contribute to the normal function of the immune system.",
  },
  "vitamin-d3": {
    everyday: "Vitamin D contributes to the maintenance of normal bones.",
    immunity: "Vitamin D contributes to the normal function of the immune system.",
  },
  "vitamin-e-selenium": {
    immunity: "Selenium contributes to the normal function of the immune system.",
  },
  "omega-3-fish-oil": {
    everyday: "EPA and DHA contribute to the normal function of the heart.",
  },
  "omega-3-algae-oil": {
    everyday: "EPA and DHA contribute to the normal function of the heart.",
  },
  "creatine-monohydrate": {
    training:
      "Creatine increases physical performance in successive bursts of short-term, high intensity exercise.",
  },
  "whey-protein": { training: "Protein contributes to a growth in muscle mass." },
  "plant-protein": { training: "Protein contributes to a growth in muscle mass." },
};

/**
 * The claim for a result: the first of its goals that has one, in the order
 * the shopper's goals put it there. Null when none does.
 */
export const authorisedClaimFor = (
  handle: string,
  goals: readonly string[],
): string | null => {
  const claims = AUTHORISED_CLAIMS[handle];
  if (!claims) return null;
  for (const goal of goals) {
    const claim = claims[goal];
    if (claim) return claim;
  }
  return null;
};
