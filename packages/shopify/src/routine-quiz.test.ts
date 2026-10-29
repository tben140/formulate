import { describe, expect, it } from "vitest";

import {
  ROUTINE_ATTRIBUTES,
  groupByRoutine,
  newRoutineId,
  routineCartLines,
  dietsFrom,
  formatKind,
  frequencyInDays,
  monthlyPlan,
  parseAnswers,
  scoreRoutine,
  serializeAnswers,
  type QuizAnswers,
  type RoutineGoal,
  type RoutineProduct,
} from "./routine-quiz";
import { toRoutineGoals } from "./routine-quiz-data";

const product = (
  id: string,
  overrides: Partial<RoutineProduct> = {},
): RoutineProduct => ({
  id,
  handle: id,
  title: id,
  available: true,
  suits: ["vegan", "vegetarian"],
  format: "capsules",
  variantId: `${id}-v`,
  sellingPlanId: `${id}-plan`,
  monthlyPrice: 10,
  currencyCode: "GBP",
  image: null,
  ...overrides,
});

const answers = (overrides: Partial<QuizAnswers> = {}): QuizAnswers => ({
  goals: ["focus"],
  diet: "none",
  format: null,
  budget: "any",
  ...overrides,
});

const ids = (goals: readonly RoutineGoal[], a: QuizAnswers) =>
  scoreRoutine(a, goals).items.map((item) => item.product.id);

describe("scoreRoutine", () => {
  const focus: RoutineGoal = {
    key: "focus",
    label: "Focus",
    products: [product("citicoline"), product("theanine"), product("lions-mane")],
  };
  const energy: RoutineGoal = {
    key: "energy",
    label: "Energy",
    products: [product("magnesium"), product("b-complex"), product("theanine")],
  };

  it("keeps the merchant's order for one goal", () => {
    expect(ids([focus, energy], answers())).toEqual([
      "citicoline",
      "theanine",
      "lions-mane",
    ]);
  });

  it("interleaves two goals so both make the cut", () => {
    expect(ids([focus, energy], answers({ goals: ["focus", "energy"] }))).toEqual([
      "citicoline",
      "magnesium",
      "theanine",
      "b-complex",
    ]);
  });

  it("lists a product in both goals once, crediting both", () => {
    const shared = scoreRoutine(answers({ goals: ["focus", "energy"] }), [
      focus,
      energy,
    ]).items.find((item) => item.product.id === "theanine");
    expect(shared?.forGoals).toEqual(["focus", "energy"]);
  });

  it("caps the routine at four products", () => {
    const big: RoutineGoal = {
      key: "everyday",
      label: "Everyday",
      products: ["a", "b", "c", "d", "e", "f"].map((id) => product(id)),
    };
    expect(ids([big], answers({ goals: ["everyday"] }))).toHaveLength(4);
  });

  it("drops unavailable products", () => {
    const goal: RoutineGoal = {
      key: "focus",
      label: "Focus",
      products: [product("gone", { available: false }), product("here")],
    };
    expect(ids([goal], answers())).toEqual(["here"]);
  });

  it("filters by diet: vegan needs vegan; vegetarian accepts either", () => {
    const goal: RoutineGoal = {
      key: "focus",
      label: "Focus",
      products: [
        product("fish-oil", { suits: [] }),
        product("collagen", { suits: [] }),
        product("whey", { suits: ["vegetarian"] }),
        product("algae", { suits: ["vegan"] }),
      ],
    };
    expect(ids([goal], answers({ diet: "vegan" }))).toEqual(["algae"]);
    expect(ids([goal], answers({ diet: "vegetarian" }))).toEqual(["whey", "algae"]);
    expect(ids([goal], answers({ diet: "none" }))).toHaveLength(4);
  });

  it("puts the chosen format first but never drops a product for format", () => {
    const goal: RoutineGoal = {
      key: "training",
      label: "Training",
      products: [product("capsule-a"), product("powder-b", { format: "powders" })],
    };
    expect(ids([goal], answers({ goals: ["training"], format: "powders" }))).toEqual([
      "powder-b",
      "capsule-a",
    ]);
  });

  it("fits the budget, skipping a dear product so a cheaper one after it still fits", () => {
    const goal: RoutineGoal = {
      key: "focus",
      label: "Focus",
      products: [
        product("a", { monthlyPrice: 18 }),
        product("dear", { monthlyPrice: 25 }),
        product("cheap", { monthlyPrice: 9.5 }),
      ],
    };
    const routine = scoreRoutine(answers({ budget: "30" }), [goal]);
    expect(routine.items.map((item) => item.product.id)).toEqual(["a", "cheap"]);
    expect(routine.monthlyTotal).toBe(27.5);
    expect(routine.leftOutForBudget).toBe(1);
  });

  it("returns an empty routine when nothing fits, rather than guessing", () => {
    const goal: RoutineGoal = {
      key: "focus",
      label: "Focus",
      products: [product("a", { suits: [] })],
    };
    expect(scoreRoutine(answers({ diet: "vegan" }), [goal]).items).toEqual([]);
    expect(scoreRoutine(answers({ goals: ["unknown"] }), [goal]).items).toEqual([]);
  });
});

describe("answers in the URL", () => {
  const known = ["energy", "focus", "sleep"];

  it("round-trips", () => {
    const a = answers({
      goals: ["focus", "sleep"],
      diet: "vegan",
      format: "powders",
      budget: "50",
    });
    expect(parseAnswers(new URLSearchParams(serializeAnswers(a)), known)).toEqual(a);
  });

  it("reads a GET form's repeated goals", () => {
    const params = new URLSearchParams(
      "goals=focus&goals=energy&diet=none&format=&budget=any",
    );
    expect(parseAnswers(params, known)?.goals).toEqual(["focus", "energy"]);
  });

  it("drops unknown goals, keeps at most two, and ignores duplicates", () => {
    const params = new URLSearchParams(
      "goals=hack,focus,focus,energy,sleep&diet=none&format=&budget=any",
    );
    expect(parseAnswers(params, known)?.goals).toEqual(["focus", "energy"]);
  });

  it.each([
    ["no goals", "diet=none&format=&budget=any"],
    ["bad diet", "goals=focus&diet=keto&format=&budget=any"],
    ["bad format", "goals=focus&diet=none&format=gummies&budget=any"],
    ["bad budget", "goals=focus&diet=none&format=&budget=1000"],
    ["an inherited property as budget", "goals=focus&diet=none&format=&budget=toString"],
    ["__proto__ as budget", "goals=focus&diet=none&format=&budget=__proto__"],
  ])("is incomplete with %s", (_name, query) => {
    expect(parseAnswers(new URLSearchParams(query), known)).toBeNull();
  });
});

describe("reading Shopify's data", () => {
  it.each([
    ["30-day", 30],
    ["4 weeks", 28],
    ["2-month", 60],
    ["0-day", null],
    ["weekly", null],
  ])("frequencyInDays(%s) = %s", (value, days) =>
    expect(frequencyInDays(value)).toBe(days),
  );

  it("reads the format from the catalogue's format-* tags", () => {
    expect(formatKind(["bestseller", "format-softgel"])).toBe("capsules");
    expect(formatKind(["format-stick-pack"])).toBe("powders");
    expect(formatKind(["format-tablet"])).toBe("capsules");
    expect(formatKind(["format-gummy"])).toBeNull();
    expect(formatKind([])).toBeNull();
  });

  it("reads diets from the vegan and vegetarian tags; untagged is unknown", () => {
    expect(dietsFrom(["Vegan", "double-helix"])).toEqual(["vegan"]);
    expect(dietsFrom(["vegetarian"])).toEqual(["vegetarian"]);
    expect(dietsFrom(["keto", "bestseller"])).toEqual([]);
  });

  it("offers the plan closest to monthly, priced per month", () => {
    expect(
      monthlyPlan([
        { id: "60", frequencyDays: 60, perDeliveryPrice: 15 },
        { id: "30", frequencyDays: 30, perDeliveryPrice: 15.26 },
      ]),
    ).toEqual({ id: "30", monthlyPrice: 15.26 });
    expect(monthlyPlan([{ id: "60", frequencyDays: 60, perDeliveryPrice: 20 }])).toEqual({
      id: "60",
      monthlyPrice: 10,
    });
    expect(monthlyPlan([])).toBeNull();
  });

  const productNode = (appName: string | null) => ({
    id: "gid://shopify/Product/1",
    handle: "magnesium-glycinate",
    title: "Magnesium Glycinate",
    availableForSale: true,
    featuredImage: null,
    tags: ["vegan", "format-capsule", "bestseller"],
    sellingPlanGroups: {
      nodes: [
        { appName, sellingPlans: { nodes: [{ id: "gid://shopify/SellingPlan/30" }] } },
      ],
    },
    variants: {
      nodes: [
        {
          id: "gid://shopify/ProductVariant/1",
          availableForSale: true,
          price: { amount: "17.95", currencyCode: "GBP" },
          sellingPlanAllocations: {
            nodes: [
              {
                sellingPlan: {
                  id: "gid://shopify/SellingPlan/30",
                  options: [{ name: "Order Frequency and Unit", value: "30-day" }],
                },
                priceAdjustments: [{ perDeliveryPrice: { amount: "15.26" } }],
              },
            ],
          },
        },
      ],
    },
  });

  const response = (appName: string | null, extra: object[] = []) =>
    ({
      metaobjects: {
        nodes: [
          {
            handle: "energy",
            key: { value: "energy" },
            label: { value: "Energy" },
            products: { references: { nodes: [productNode(appName)] } },
          },
          ...extra,
        ],
      },
    }) as never;

  it("turns a goal and its products into quiz data, on the app-owned plan", () => {
    const [goal] = toRoutineGoals(response("Recharge"));
    expect(goal?.key).toBe("energy");
    expect(goal?.products[0]).toMatchObject({
      suits: ["vegan"],
      format: "capsules",
      sellingPlanId: "gid://shopify/SellingPlan/30",
      monthlyPrice: 15.26,
    });
  });

  it("offers the first size in stock, not a sold-out first size", () => {
    const node = productNode("Recharge");
    const soldOut = {
      ...node.variants.nodes[0]!,
      id: "gid://shopify/ProductVariant/200mg",
      availableForSale: false,
    };
    const data = {
      metaobjects: {
        nodes: [
          {
            handle: "energy",
            key: { value: "energy" },
            label: { value: "Energy" },
            products: {
              references: {
                nodes: [
                  { ...node, variants: { nodes: [soldOut, node.variants.nodes[0]!] } },
                ],
              },
            },
          },
        ],
      },
    } as never;
    const [goal] = toRoutineGoals(data);
    expect(goal?.products[0]).toMatchObject({
      available: true,
      variantId: "gid://shopify/ProductVariant/1",
    });
  });

  it("never offers a plan no app owns: falls back to one-off at full price", () => {
    const [goal] = toRoutineGoals(response(null));
    expect(goal?.products[0]).toMatchObject({ sellingPlanId: null, monthlyPrice: 17.95 });
  });

  it("leaves out half-filled goals", () => {
    const goals = toRoutineGoals(
      response("Recharge", [
        { handle: "x", key: { value: "sleep" }, label: null, products: null },
        { handle: "y", key: null, label: { value: "Focus" }, products: null },
        {
          handle: "z",
          key: { value: "training" },
          label: { value: "Training" },
          products: { references: { nodes: [] } },
        },
      ]),
    );
    expect(goals.map((goal) => goal.key)).toEqual(["energy"]);
  });
});

describe("one routine, one renewal (SHO-176)", () => {
  const picks = [
    {
      variantId: "gid://shopify/ProductVariant/1",
      sellingPlanId: "gid://shopify/SellingPlan/30",
      title: "Magnesium Glycinate",
    },
    {
      variantId: "gid://shopify/ProductVariant/2",
      sellingPlanId: "gid://shopify/SellingPlan/30",
      title: "Vitamin D3",
    },
    { variantId: "gid://shopify/ProductVariant/3", sellingPlanId: null, title: "Shaker" },
  ];

  it("tags every subscription with the routine id and a readable label", () => {
    const lines = routineCartLines(picks, "r-test");
    expect(lines[0]).toEqual({
      merchandiseId: "gid://shopify/ProductVariant/1",
      quantity: 1,
      sellingPlanId: "gid://shopify/SellingPlan/30",
      attributes: [
        { key: ROUTINE_ATTRIBUTES.id, value: "r-test" },
        { key: ROUTINE_ATTRIBUTES.label, value: "Magnesium Glycinate + Vitamin D3" },
      ],
    });
    expect(lines[1]?.attributes).toEqual(lines[0]?.attributes);
  });

  it("adds a one-off product plain, and doesn't tag a lone subscription", () => {
    expect(routineCartLines(picks, "r-test")[2]).toEqual({
      merchandiseId: "gid://shopify/ProductVariant/3",
      quantity: 1,
    });
    const lone = routineCartLines([picks[0]!, picks[2]!], "r-test");
    expect(lone[0]?.attributes).toBeUndefined();
  });

  it("gives each routine its own id", () => {
    expect(newRoutineId()).toMatch(/^r-[a-z0-9]+$/);
    expect(newRoutineId()).not.toBe(newRoutineId());
  });

  it("groups subscriptions into routines for the portal", () => {
    const tagged = (id: number, routine: string) => ({
      id,
      properties: [
        { name: "_routine", value: routine },
        { name: "Routine", value: "Magnesium Glycinate + Vitamin D3" },
      ],
    });
    const { routines, single } = groupByRoutine([
      tagged(1, "r-a"),
      { id: 2, properties: [] },
      tagged(3, "r-a"),
      tagged(4, "r-b"),
    ]);
    expect(routines).toEqual([
      {
        id: "r-a",
        label: "Magnesium Glycinate + Vitamin D3",
        subscriptions: [tagged(1, "r-a"), tagged(3, "r-a")],
      },
    ]);
    // r-b has one member left, so it's shown on its own.
    expect(single.map((subscription) => subscription.id)).toEqual([2, 4]);
  });
});
