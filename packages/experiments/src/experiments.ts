/**
 * Every experiment the apps run, defined once (ADR 0013). The same rule as
 * event names in packages/analytics: a string literal experiment key in an
 * app is a bug, because a key that differs by one character from GrowthBook's
 * silently runs nothing.
 *
 * `key` is the GrowthBook **feature** key. Its experiment rule in GrowthBook
 * gives each variation one of `variants` as its value; the first is the
 * control, which everyone outside the experiment sees.
 */
export interface ExperimentDefinition {
  readonly key: string;
  readonly variants: readonly [string, ...string[]];
}

export const EXPERIMENTS = {
  /**
   * An A/A test: both arms render the same product page. It proves the split
   * is even and that two identical arms show no difference, before any real
   * result is trusted (ADR 0013).
   */
  productPageAa: {
    key: "product-page-aa",
    variants: ["control", "control-copy"],
  },
} as const satisfies Record<string, ExperimentDefinition>;

export type ExperimentName = keyof typeof EXPERIMENTS;

/** The variant names of one experiment, as a union. */
export type VariantOf<D extends ExperimentDefinition> = D["variants"][number];
