import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect } from "storybook/test";

import { Pagination } from "./pagination";

const meta = {
  title: "Catalogue/Pagination",
  component: Pagination,
  args: {
    path: "/collections/sleep",
    // A filter in the URL, which paging keeps.
    params: new URLSearchParams("filter.v.availability=1"),
    pageInfo: {
      hasNextPage: true,
      hasPreviousPage: true,
      startCursor: "start",
      endCursor: "end",
    },
  },
  decorators: [
    (Story) => (
      <div className="w-[40rem]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Pagination>;

export default meta;
type Story = StoryObj<typeof meta>;

/** A page in the middle: both links, and the filter carries over. */
export const Middle: Story = {
  play: async ({ canvas }) => {
    const next = canvas.getByRole("link", { name: "Next →" });
    await expect(next).toHaveAttribute(
      "href",
      "/collections/sleep?filter.v.availability=1&after=end",
    );
    await expect(next).toHaveAttribute("rel", "next");
  },
};

/** The first page: Next only, still on the right. */
export const FirstPage: Story = {
  args: { pageInfo: { hasNextPage: true, hasPreviousPage: false, endCursor: "end" } },
};

export const LastPage: Story = {
  args: { pageInfo: { hasNextPage: false, hasPreviousPage: true, startCursor: "start" } },
};

/** One page of results: nothing renders. */
export const SinglePage: Story = {
  args: { pageInfo: { hasNextPage: false, hasPreviousPage: false } },
  play: async ({ canvas }) => {
    await expect(canvas.queryByRole("navigation")).toBeNull();
  },
};
