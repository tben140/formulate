import { FIXTURE_PRODUCTS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ProductCard } from "./product-card";

const meta = {
  title: "Catalogue/Product card",
  component: ProductCard,
  args: { product: FIXTURE_PRODUCTS.magnesium, sizes: "300px" },
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

/** One card at a card's width. Not on the meta, so Grid isn't squeezed into it. */
const oneCard: Story["decorators"] = [
  (Story) => (
    <div className="w-72">
      <Story />
    </div>
  ),
];

export const Default: Story = { decorators: oneCard };

/** The fallback when a product has no image in Shopify. */
export const NoImage: Story = {
  args: { product: FIXTURE_PRODUCTS.noImage },
  decorators: oneCard,
};

export const LongTitle: Story = {
  args: { product: FIXTURE_PRODUCTS.focusSticks },
  decorators: oneCard,
};

/**
 * As on a collection page, with its responsive columns (one, two, then three
 * across): the first card is the LCP image (`priority`).
 */
export const Grid: Story = {
  render: () => (
    <ul className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {[
        FIXTURE_PRODUCTS.magnesium,
        FIXTURE_PRODUCTS.multivitamin,
        FIXTURE_PRODUCTS.vitaminD3,
      ].map((product, index) => (
        <li key={product.handle}>
          <ProductCard product={product} sizes="300px" priority={index === 0} />
        </li>
      ))}
    </ul>
  ),
};
