import { FIXTURE_FILTERS } from "@formulate/shopify/fixtures";
import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { View } from "react-native";
import { expect, fn, screen } from "storybook/test";

import { CollectionFilters } from "./collection-filters";

/** Search & Discovery filters on a collection screen, matching web and the theme. */
const meta = {
  title: "Catalogue/Collection filters",
  component: CollectionFilters,
  args: { filters: FIXTURE_FILTERS, query: "", onChange: fn(), productCount: 6 },
  parameters: {
    // ⚠️ Known finding, fixed by #69 (SHO-92): the options carry
    // accessibilityState.selected, so React Native Web writes no aria-checked
    // and axe flags every radio/checkbox. Remove this once #69 is merged.
    a11y: { config: { rules: [{ id: "aria-required-attr", enabled: false }] } },
  },
  decorators: [
    (Story) => (
      <View className="w-96">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof CollectionFilters>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/**
 * Filters applied: a count on the button and a chip each to remove them. The
 * count is 3: the price range's two bounds count separately, as on web.
 */
export const Applied: Story = {
  args: {
    query: "filter.v.option.flavour=Vanilla&filter.v.price.gte=10&filter.v.price.lte=25",
    productCount: 1,
  },
  play: async ({ canvas, args, userEvent }) => {
    await expect(canvas.getByRole("button", { name: "Filter, 3 active" })).toBeVisible();
    await userEvent.click(
      canvas.getByRole("button", { name: "Flavour: Vanilla, remove filter" }),
    );
    await expect(args.onChange).toHaveBeenCalledWith(
      "filter.v.price.gte=10&filter.v.price.lte=25",
    );
  },
};

/** The sheet of options, opened from the Filter button. */
export const SheetOpen: Story = {
  play: async ({ canvas, userEvent }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Filter" }));
    // A dialog once it has slid in (see cart-sheet.stories.tsx).
    await screen.findByRole("dialog");
    await expect(screen.getByRole("button", { name: "Close filters" })).toBeVisible();
  },
};
