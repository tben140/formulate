import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { StorefrontErrorState } from "./storefront-error";

const meta = {
  title: "Feedback/Storefront error",
  component: StorefrontErrorState,
} satisfies Meta<typeof StorefrontErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

/** No .env.local: the first thing a new developer sees. */
export const MissingConfig: Story = {
  args: { error: { kind: "config", message: "SHOPIFY_STOREFRONT_TOKEN is not set." } },
};

export const RejectedToken: Story = {
  args: { error: { kind: "http", status: 401, message: "Unauthorized" } },
};

export const Throttled: Story = {
  args: { error: { kind: "http", status: 430, message: "Too many requests" } },
};

export const Offline: Story = {
  args: { error: { kind: "network", message: "fetch failed", cause: null } },
};
