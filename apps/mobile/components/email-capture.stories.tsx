import type { Meta, StoryObj } from "@storybook/react-native-web-vite";
import { expect, fn, mocked } from "storybook/test";
import { View } from "react-native";

import { subscribe } from "../lib/klaviyo";
import { useIdentifyBuyer } from "../lib/use-cart";

import { EmailCapture } from "./email-capture";

const meta = {
  title: "Marketing/Email capture",
  component: EmailCapture,
  beforeEach: () => {
    // The mutation the form calls after a sign-up; only `mutate` is used.
    mocked(useIdentifyBuyer).mockReturnValue({ mutate: fn() } as unknown as ReturnType<
      typeof useIdentifyBuyer
    >);
  },
  decorators: [
    (Story) => (
      <View className="max-w-md">
        <Story />
      </View>
    ),
  ],
} satisfies Meta<typeof EmailCapture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const SignsUp: Story = {
  beforeEach: () => {
    mocked(subscribe).mockResolvedValue({ ok: true });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(/restock/i), "ada@company.com");
    await userEvent.click(canvas.getByRole("button"));
    await expect(await canvas.findByText(/inbox/i)).toBeVisible();
  },
};

/** The worker is rate limiting: the app's message for it is distinct from web's. */
export const RateLimited: Story = {
  beforeEach: () => {
    mocked(subscribe).mockResolvedValue({ ok: false, reason: "rate-limited" });
  },
  play: async ({ canvas, userEvent }) => {
    await userEvent.type(canvas.getByLabelText(/restock/i), "ada@company.com");
    await userEvent.click(canvas.getByRole("button"));
    await expect(await canvas.findByText(/too many/i)).toBeVisible();
  },
};
