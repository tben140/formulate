import { FIXTURE_FILTERS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { CollectionFilters } from "./collection-filters";

/**
 * Search & Discovery filters for a listing. No client JavaScript: a
 * <details> holding a GET form, so every filtered page is a plain URL.
 */
const meta = {
  title: "Catalogue/Collection filters",
  component: CollectionFilters,
  args: {
    filters: FIXTURE_FILTERS,
    params: new URLSearchParams(),
    path: "/collections/performance",
    productCount: 6,
  },
  decorators: [
    (Story) => (
      <div className="w-[48rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof CollectionFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Closed: Story = {};

/** The panel open. "Out of stock" has nothing to find, so it can't be ticked. */
export const Open: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByText("Filter"));
    await expect(canvas.getByRole("checkbox", { name: /Out of stock/ })).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "Apply" })).toBeVisible();
  },
};

/** Filters applied: a count on the button, and a chip each to remove them. */
export const Applied: Story = {
  args: {
    params: new URLSearchParams(
      "filter.v.option.flavour=Vanilla&filter.v.price.gte=10&filter.v.price.lte=25",
    ),
    productCount: 1,
  },
  play: async ({ canvas }) => {
    const chips = canvas.getByRole("list", { name: "Active filters" });
    await expect(chips).toHaveTextContent("Flavour: Vanilla");
    await expect(chips).toHaveTextContent("Price: £10 – £25");
    await expect(canvas.getByText("1 product")).toBeVisible();
  },
};
