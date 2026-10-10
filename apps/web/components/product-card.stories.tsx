import { FIXTURE_PRODUCTS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { ProductCard } from "./product-card";

const meta = {
  title: "Catalogue/Product card",
  component: ProductCard,
  args: { product: FIXTURE_PRODUCTS.magnesium, sizes: "300px" },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProductCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** The fallback when a product has no image in Shopify. */
export const NoImage: Story = { args: { product: FIXTURE_PRODUCTS.noImage } };

export const LongTitle: Story = { args: { product: FIXTURE_PRODUCTS.focusSticks } };

/** Three across, as on a collection page: the first card loads eagerly. */
export const Grid: Story = {
  decorators: [
    () => (
      <ul className="grid w-[56rem] grid-cols-3 gap-6">
        {[
          FIXTURE_PRODUCTS.magnesium,
          FIXTURE_PRODUCTS.multivitamin,
          FIXTURE_PRODUCTS.vitaminD3,
        ].map((product, index) => (
          <li key={product.handle}>
            <ProductCard
              product={product}
              sizes="300px"
              loading={index === 0 ? "eager" : undefined}
            />
          </li>
        ))}
      </ul>
    ),
  ],
};
