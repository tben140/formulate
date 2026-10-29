/**
 * The routine quiz (SHO-161): the questions, the answers and the scoring,
 * shared by every surface.
 *
 * ⚠️ **Goals and preferences, never symptoms or health data** (ADR 0009).
 * "Focus" is a goal; "I struggle to concentrate" describes a condition. Goal
 * wording comes from Shopify (the `routine_goal` metaobject's `label`), so the
 * merchant owns it, and docs/claims-wording.md governs it.
 *
 * Which products serve which goal also lives in Shopify, not here: the
 * metaobject's ordered product list, and product tags for diet (`vegan`,
 * `vegetarian`) and format (`format-capsule`, `format-powder`, …), the tags
 * the catalogue's automated collections already use. Changing them changes
 * results with no deploy.
 */

export const DIETS = ["vegan", "vegetarian", "none"] as const;
export type Diet = (typeof DIETS)[number];

/** The two kinds of format a shopper chooses between. */
export const FORMATS = ["capsules", "powders"] as const;
export type FormatPreference = (typeof FORMATS)[number];

/** Monthly budget bands, in the store's currency (GBP). */
export const BUDGETS = {
  "30": { label: "Up to £30 a month", max: 30 },
  "50": { label: "Up to £50 a month", max: 50 },
  "80": { label: "Up to £80 a month", max: 80 },
  any: { label: "No set budget", max: Number.POSITIVE_INFINITY },
} as const;
export type Budget = keyof typeof BUDGETS;

/** How many goals a shopper may pick, and how many products a routine holds. */
export const MAX_GOALS = 2;
export const MAX_PRODUCTS = 4;

export interface QuizAnswers {
  /** Goal keys, 1 to MAX_GOALS, in the order chosen. */
  readonly goals: readonly string[];
  readonly diet: Diet;
  readonly format: FormatPreference | null;
  readonly budget: Budget;
}

/** A product as the scorer sees it, already read from Shopify. */
export interface RoutineProduct {
  readonly id: string;
  readonly handle: string;
  readonly title: string;
  readonly available: boolean;
  /** From the `vegan` and `vegetarian` tags. Empty means neither is known. */
  readonly suits: readonly ("vegan" | "vegetarian")[];
  /** From a `format-*` tag, as capsules or powders; null if untagged. */
  readonly format: FormatPreference | null;
  readonly variantId: string;
  /** The roughly-monthly subscription plan to offer, or null for one-off only. */
  readonly sellingPlanId: string | null;
  /** Price per month on that plan (or one-off if there's no plan). */
  readonly monthlyPrice: number;
  readonly currencyCode: string;
  readonly image: { readonly url: string; readonly altText: string | null } | null;
}

export interface RoutineGoal {
  readonly key: string;
  readonly label: string;
  /** The routine for this goal, most relevant first. */
  readonly products: readonly RoutineProduct[];
}

export interface RoutineItem {
  readonly product: RoutineProduct;
  /** Which of the shopper's goals put it in the routine: for "for your … goal". */
  readonly forGoals: readonly string[];
}

export interface Routine {
  readonly items: readonly RoutineItem[];
  readonly monthlyTotal: number;
  /** Products that matched but didn't fit the budget, so the page can say so. */
  readonly leftOutForBudget: number;
}

/* -------------------------------------------------------------------------- */
/*  Answers in a URL                                                           */
/* -------------------------------------------------------------------------- */

/*
 * Answers live in the URL (`?goals=focus,energy&diet=vegan&format=&budget=50`),
 * so a result is shareable, survives a reload, and the quiz works as a plain
 * GET form without JavaScript. The saved routine stores the same string.
 */

type Params = { get(name: string): string | null; getAll?(name: string): string[] };

/**
 * Valid answers from URL parameters, or null if the quiz isn't complete.
 * Unknown goal keys are dropped against `knownGoals`; anything else malformed
 * falls back to null rather than guessing.
 */
export const parseAnswers = (
  params: Params,
  knownGoals: readonly string[],
): QuizAnswers | null => {
  // A GET form sends one `goals` per ticked box; a shared link has "a,b".
  const raw = params.getAll?.("goals") ?? [params.get("goals") ?? ""];
  const goals = [
    ...new Set(
      raw
        .flatMap((value) => value.split(","))
        .map((value) => value.trim())
        .filter((key) => knownGoals.includes(key)),
    ),
  ].slice(0, MAX_GOALS);

  const diet = params.get("diet");
  const format = params.get("format") ?? "";
  const budget = params.get("budget");

  if (goals.length === 0) return null;
  if (!DIETS.includes(diet as Diet)) return null;
  if (format !== "" && !FORMATS.includes(format as FormatPreference)) return null;
  // An own-property check: `in` would also accept "toString" and friends.
  if (!budget || !Object.hasOwn(BUDGETS, budget)) return null;

  return {
    goals,
    diet: diet as Diet,
    format: format === "" ? null : (format as FormatPreference),
    budget: budget as Budget,
  };
};

export const serializeAnswers = (answers: QuizAnswers): string =>
  new URLSearchParams({
    goals: answers.goals.join(","),
    diet: answers.diet,
    format: answers.format ?? "",
    budget: answers.budget,
  }).toString();

/* -------------------------------------------------------------------------- */
/*  Scoring                                                                    */
/* -------------------------------------------------------------------------- */

const suitsDiet = (product: RoutineProduct, diet: Diet): boolean =>
  diet === "none" ||
  product.suits.includes("vegan") ||
  (diet === "vegetarian" && product.suits.includes("vegetarian"));

/**
 * The suggested routine for a set of answers. Pure: everything it needs is
 * passed in.
 *
 * 1. Goals are **interleaved**, first product of each goal, then second, and
 *    so on, so two goals both make it into a four-product routine. (Taking
 *    one goal's whole list first would let it fill every place.)
 * 2. A product in both goals' lists appears once, crediting both.
 * 3. Unavailable products, and those that don't suit the diet, are dropped.
 * 4. The chosen format goes first, but a product is never dropped for format.
 * 5. At most MAX_PRODUCTS, and within the budget: a product that would take
 *    the total over is skipped, and a cheaper one after it can still fit.
 */
export const scoreRoutine = (
  answers: QuizAnswers,
  goals: readonly RoutineGoal[],
): Routine => {
  const chosen = answers.goals
    .map((key) => goals.find((goal) => goal.key === key))
    .filter((goal): goal is RoutineGoal => goal !== undefined);

  const byId = new Map<string, { product: RoutineProduct; forGoals: string[] }>();
  const longest = Math.max(0, ...chosen.map((goal) => goal.products.length));
  for (let rank = 0; rank < longest; rank += 1) {
    for (const goal of chosen) {
      const product = goal.products[rank];
      if (!product) continue;
      const seen = byId.get(product.id);
      if (seen) {
        if (!seen.forGoals.includes(goal.key)) seen.forGoals.push(goal.key);
      } else byId.set(product.id, { product, forGoals: [goal.key] });
    }
  }

  const candidates = [...byId.values()].filter(
    ({ product }) => product.available && suitsDiet(product, answers.diet),
  );

  const preferred = answers.format
    ? [
        ...candidates.filter(({ product }) => product.format === answers.format),
        ...candidates.filter(({ product }) => product.format !== answers.format),
      ]
    : candidates;

  const max = BUDGETS[answers.budget].max;
  const items: RoutineItem[] = [];
  let monthlyTotal = 0;
  let leftOutForBudget = 0;
  for (const candidate of preferred) {
    if (items.length === MAX_PRODUCTS) break;
    if (monthlyTotal + candidate.product.monthlyPrice > max) {
      leftOutForBudget += 1;
      continue;
    }
    items.push(candidate);
    monthlyTotal += candidate.product.monthlyPrice;
  }

  return { items, monthlyTotal: Math.round(monthlyTotal * 100) / 100, leftOutForBudget };
};

/* -------------------------------------------------------------------------- */
/*  From Shopify's response                                                    */
/* -------------------------------------------------------------------------- */

/** "30-day", "4 weeks", "1-month" → days; null if it can't be read. */
export const frequencyInDays = (value: string): number | null => {
  const match = /^\s*(\d+)\s*[- ]?\s*(day|week|month)s?\s*$/i.exec(value);
  if (!match) return null;
  const count = Number(match[1]);
  if (count < 1) return null;
  const unit = match[2]!.toLowerCase();
  return unit === "day" ? count : unit === "week" ? count * 7 : count * 30;
};

const FORMAT_KINDS: Record<string, FormatPreference> = {
  capsule: "capsules",
  tablet: "capsules",
  softgel: "capsules",
  powder: "powders",
  stick: "powders",
};

/**
 * A product's format from its `format-*` tag ("format-capsule",
 * "format-stick-pack", …), as the quiz's two kinds; null if untagged.
 */
export const formatKind = (tags: readonly string[]): FormatPreference | null => {
  for (const tag of tags) {
    const match = /^format-(capsule|tablet|softgel|powder|stick)/i.exec(tag.trim());
    if (match) return FORMAT_KINDS[match[1]!.toLowerCase()] ?? null;
  }
  return null;
};

/**
 * Which diets a product suits, from its `vegan` and `vegetarian` tags.
 * Untagged means unknown, so a vegan or vegetarian shopper isn't shown it:
 * wrong in the cautious direction.
 */
export const dietsFrom = (tags: readonly string[]): ("vegan" | "vegetarian")[] => {
  const lower = tags.map((tag) => tag.trim().toLowerCase());
  return (["vegan", "vegetarian"] as const).filter((diet) => lower.includes(diet));
};

export interface PlanChoice {
  readonly id: string;
  readonly frequencyDays: number | null;
  readonly perDeliveryPrice: number;
}

/**
 * The plan to offer in a routine: the one closest to monthly, so the routine
 * has one rhythm, and its price scaled to a month. Callers pass only plans an
 * app owns (`purchasableAllocations`), or a shopper could buy a subscription
 * nothing fulfils.
 */
export const monthlyPlan = (
  plans: readonly PlanChoice[],
): { readonly id: string; readonly monthlyPrice: number } | null => {
  const readable = plans.filter((plan) => plan.frequencyDays !== null);
  if (readable.length === 0) return null;
  const best = readable.reduce((closest, plan) =>
    Math.abs(plan.frequencyDays! - 30) < Math.abs(closest.frequencyDays! - 30)
      ? plan
      : closest,
  );
  return {
    id: best.id,
    monthlyPrice:
      Math.round(((best.perDeliveryPrice * 30) / best.frequencyDays!) * 100) / 100,
  };
};

/* -------------------------------------------------------------------------- */
/*  One routine, one renewal (SHO-176)                                         */
/* -------------------------------------------------------------------------- */

/*
 * A routine is bought as one subscription per product, all on the same
 * roughly-monthly plan, and every one carries the same routine id as a line
 * property. Line properties reach Recharge's subscriptions (verified on order
 * #1011, SHO-84), and Recharge already charges subscriptions with the same
 * date, address and payment method together. So the shopper gets one
 * renewal, and the portal can show, skip or pause the routine as one thing by
 * grouping on the id.
 *
 * Why not one bundled line: Shopify rejects a Cart Transform expand on a line
 * with a selling plan, so a subscription can't be one line priced from its
 * parts; and Recharge's own bundles need a plan this store doesn't have.
 * docs/integration-recharge.md, "Routines as one renewal".
 */

/** Line property keys. `_routine` is hidden at checkout; `Routine` is shown. */
export const ROUTINE_ATTRIBUTES = { id: "_routine", label: "Routine" } as const;

/** What the routine form posts for each ticked product. */
export interface RoutinePick {
  readonly variantId: string;
  readonly sellingPlanId: string | null;
  readonly title: string;
}

/** A short id for one routine, unique enough to tell a shopper's routines apart. */
export const newRoutineId = (): string =>
  `r-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/**
 * The cart lines for a routine. Subscription lines share the routine id and a
 * readable label; a one-off product isn't part of the renewal, so it's added
 * plain. One subscription on its own isn't a routine, so it isn't tagged.
 */
export const routineCartLines = (
  picks: readonly RoutinePick[],
  routineId: string,
): {
  merchandiseId: string;
  quantity: number;
  sellingPlanId?: string;
  attributes?: { key: string; value: string }[];
}[] => {
  const subscribed = picks.filter((pick) => pick.sellingPlanId);
  const label = subscribed.map((pick) => pick.title).join(" + ");
  const tag = subscribed.length > 1;
  return picks.map((pick) =>
    pick.sellingPlanId
      ? {
          merchandiseId: pick.variantId,
          quantity: 1,
          sellingPlanId: pick.sellingPlanId,
          ...(tag
            ? {
                attributes: [
                  { key: ROUTINE_ATTRIBUTES.id, value: routineId },
                  { key: ROUTINE_ATTRIBUTES.label, value: label },
                ],
              }
            : {}),
        }
      : { merchandiseId: pick.variantId, quantity: 1 },
  );
};

/** A subscription as the portal reads it: its id and line properties. */
export interface PropertiedSubscription {
  readonly id: string | number;
  readonly properties: readonly { readonly name: string; readonly value: string }[];
}

/**
 * Subscriptions grouped into routines, for the portal: each routine's id,
 * label and members, then the subscriptions that belong to none. A routine
 * left with one member (the rest cancelled) is shown on its own.
 */
export const groupByRoutine = <S extends PropertiedSubscription>(
  subscriptions: readonly S[],
): {
  routines: { id: string; label: string; subscriptions: S[] }[];
  single: S[];
} => {
  const property = (subscription: S, name: string) =>
    subscription.properties.find((entry) => entry.name === name)?.value ?? "";
  const byId = new Map<string, { id: string; label: string; subscriptions: S[] }>();
  const single: S[] = [];
  for (const subscription of subscriptions) {
    const id = property(subscription, ROUTINE_ATTRIBUTES.id);
    if (!id) {
      single.push(subscription);
      continue;
    }
    const group = byId.get(id) ?? {
      id,
      label: property(subscription, ROUTINE_ATTRIBUTES.label),
      subscriptions: [],
    };
    group.subscriptions.push(subscription);
    byId.set(id, group);
  }
  const routines = [...byId.values()].filter((group) => {
    if (group.subscriptions.length > 1) return true;
    single.push(...group.subscriptions);
    return false;
  });
  return { routines, single };
};
