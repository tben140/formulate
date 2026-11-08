import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, fn } from "storybook/test";

import { ErrorState } from "./error-state";

const meta = {
  title: "Feedback/Error state",
  component: ErrorState,
  args: {
    error: Object.assign(new Error("Cannot read properties of undefined"), {
      digest: "1234",
    }),
    unstable_retry: fn(),
  },
} satisfies Meta<typeof ErrorState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

/** "Try again" calls Next's retry, and the error's message never reaches the page. */
export const RetryAndNoLeak: Story = {
  play: async ({ args, canvas, userEvent }) => {
    await expect(canvas.queryByText(/Cannot read properties/)).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: /try again/i }));
    await expect(args.unstable_retry).toHaveBeenCalledOnce();
  },
};
