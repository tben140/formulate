import { beforeEach, expect, jest, test } from "@jest/globals";
import { fireEvent, render, screen } from "@testing-library/react-native";

import type { Product } from "../../lib/use-purchase";
import { usePurchase } from "../../lib/use-purchase";
import { AddToCart } from "../add-to-cart";

/**
 * The product screen's buy controls, with the real selection logic
 * (usePurchase and @formulate/shopify) and only the add-to-cart request
 * stubbed: these pin which variant and plan reach the cart, and what a
 * shopper is told when they can't buy.
 */

type AddLine = { merchandiseId: string; quantity: number; sellingPlanId?: string };

const mockAddToCart = {
  mutate: jest.fn<(line: AddLine, callbacks?: { onSuccess?: () => void }) => void>(),
  isPending: false,
  isError: false,
  isSuccess: false,
  error: null as Error | null,
  data: undefined as { notice?: string } | undefined,
};

jest.mock("../../lib/use-cart", () => ({
  useAddToCart: () => mockAddToCart,
}));

const money = (amount: string) => ({ amount, currencyCode: "GBP" });

const PLAN = "gid://shopify/SellingPlan/30";
const SEED_PLAN = "gid://shopify/SellingPlan/seed";

const variant = (
  id: string,
  strength: string,
  availableForSale = true,
  plans = true,
) => ({
  id,
  title: strength,
  availableForSale,
  selectedOptions: [{ name: "Strength", value: strength }],
  price: money(strength === "High" ? "18.00" : "15.95"),
  sellingPlanAllocations: {
    nodes: plans
      ? [
          {
            sellingPlan: { id: PLAN, name: "Every 30 days, 15% off" },
            priceAdjustments: [{ price: money("13.56") }],
          },
          // A plan from a group no app owns: never offered (see purchasableAllocations).
          {
            sellingPlan: { id: SEED_PLAN, name: "Seed plan" },
            priceAdjustments: [{ price: money("1.00") }],
          },
        ]
      : [],
  },
});

const product = (
  variants = [variant("v-standard", "Standard"), variant("v-high", "High")],
) =>
  ({
    id: "p1",
    title: "Magnesium Glycinate",
    options: [
      {
        name: "Strength",
        optionValues: [{ name: "Standard" }, { name: "High" }],
      },
    ],
    variants: { nodes: variants },
    sellingPlanGroups: {
      nodes: [
        { appName: "Recharge", sellingPlans: { nodes: [{ id: PLAN }] } },
        { appName: null, sellingPlans: { nodes: [{ id: SEED_PLAN }] } },
      ],
    },
  }) as unknown as Product;

const Harness = ({ of, onAdded = () => {} }: { of: Product; onAdded?: () => void }) => {
  const purchase = usePurchase(of);
  return <AddToCart product={of} purchase={purchase} onAdded={onAdded} />;
};

const lastLine = () => mockAddToCart.mutate.mock.calls.at(-1)?.[0];

beforeEach(() => {
  mockAddToCart.mutate.mockReset();
});

test("adds the selected variant, one-time by default", async () => {
  await render(<Harness of={product()} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add to cart" }));
  expect(lastLine()).toEqual({ merchandiseId: "v-standard", quantity: 1 });
});

test("offers only plans an app manages, and sends the chosen one", async () => {
  await render(<Harness of={product()} />);
  expect(screen.queryByRole("radio", { name: /Seed plan/ })).toBeNull();
  await fireEvent.press(
    screen.getByRole("radio", { name: "Every 30 days, 15% off, £13.56" }),
  );
  expect(
    screen.getByRole("radio", { name: "Every 30 days, 15% off, £13.56" }),
  ).toBeChecked();
  // On the chosen plan, and as the price shown above the button.
  expect(screen.getAllByText("£13.56")).toHaveLength(2);
  await fireEvent.press(screen.getByRole("button", { name: "Add to cart" }));
  expect(lastLine()).toEqual({
    merchandiseId: "v-standard",
    quantity: 1,
    sellingPlanId: PLAN,
  });
});

test("switching variant keeps the plan when the new variant offers it", async () => {
  await render(<Harness of={product()} />);
  await fireEvent.press(
    screen.getByRole("radio", { name: "Every 30 days, 15% off, £13.56" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "High" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add to cart" }));
  expect(lastLine()).toEqual({
    merchandiseId: "v-high",
    quantity: 1,
    sellingPlanId: PLAN,
  });
});

test("falls back to one-time on a variant without the plan, and remembers the choice", async () => {
  await render(
    <Harness
      of={product([
        variant("v-standard", "Standard"),
        variant("v-high", "High", true, false),
      ])}
    />,
  );
  await fireEvent.press(
    screen.getByRole("radio", { name: "Every 30 days, 15% off, £13.56" }),
  );
  await fireEvent.press(screen.getByRole("radio", { name: "High" }));
  await fireEvent.press(screen.getByRole("button", { name: "Add to cart" }));
  expect(lastLine()).toEqual({ merchandiseId: "v-high", quantity: 1 });

  await fireEvent.press(screen.getByRole("radio", { name: "Standard" }));
  expect(
    screen.getByRole("radio", { name: "Every 30 days, 15% off, £13.56" }),
  ).toBeChecked();
});

test("a sold-out variant says so, on the option and the button, and can't be added", async () => {
  await render(
    <Harness
      of={product([variant("v-standard", "Standard"), variant("v-high", "High", false)])}
    />,
  );
  await fireEvent.press(screen.getByRole("radio", { name: "High, sold out" }));
  const button = screen.getByRole("button", { name: "Sold out" });
  expect(button).toBeDisabled();
  await fireEvent.press(button);
  expect(mockAddToCart.mutate).not.toHaveBeenCalled();
});

test("calls back once the line is in the cart, so the screen can open it", async () => {
  const onAdded = jest.fn();
  await render(<Harness of={product()} onAdded={onAdded} />);
  await fireEvent.press(screen.getByRole("button", { name: "Add to cart" }));
  mockAddToCart.mutate.mock.calls.at(-1)?.[1]?.onSuccess?.();
  expect(onAdded).toHaveBeenCalledTimes(1);
});
