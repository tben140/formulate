import { FIXTURE_NAV_LINKS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { SiteNav } from "./site-nav";

/** The header's collection links, from the Shopify menu. */
const meta = {
  title: "Navigation/Site nav",
  component: SiteNav,
  args: { links: FIXTURE_NAV_LINKS },
  parameters: { nextjs: { navigation: { pathname: "/collections/focus" } } },
  decorators: [
    (Story) => (
      <nav aria-label="Main" className="flex">
        <Story />
      </nav>
    ),
  ],
} satisfies Meta<typeof SiteNav>;

export default meta;
type Story = StoryObj<typeof meta>;

/** On a collection page: that link is marked as the current page. */
export const OnACollection: Story = {
  play: async ({ canvas }) => {
    await expect(canvas.getByRole("link", { name: "Focus" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  },
};

/** On a phone the row scrolls sideways, fading out at the edge. */
export const Phone: Story = {
  globals: { viewport: { value: "mobile1" } },
  parameters: { nextjs: { navigation: { pathname: "/collections/all" } } },
};
