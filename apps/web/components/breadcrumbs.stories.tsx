import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { Breadcrumbs } from "./breadcrumbs";

const meta = {
  title: "Navigation/Breadcrumbs",
  component: Breadcrumbs,
} satisfies Meta<typeof Breadcrumbs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const ProductPage: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      { label: "Best Sellers", href: "/collections/best-sellers" },
      { label: "Magnesium Glycinate" },
    ],
  },
};

/** A long product name shouldn't push the trail off small screens. */
export const LongTitle: Story = {
  args: {
    items: [
      { label: "Home", href: "/" },
      { label: "Mind & Focus", href: "/collections/mind-focus" },
      { label: "Citicoline + L-Theanine Daily Sticks" },
    ],
  },
  globals: { viewport: { value: "mobile1" } },
};
