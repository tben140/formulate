import type { Meta, StoryObj } from "@storybook/nextjs-vite";
import { expect, mocked } from "storybook/test";

import { subscribe } from "@/lib/klaviyo";

import { EmailCapture } from "./email-capture";

const meta = {
  title: "Marketing/Email capture",
  component: EmailCapture,
  decorators: [
    (Story) => (
      <div className="max-w-md">
        <Story />
      </div>
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
    await userEvent.type(
      canvas.getByRole("textbox", { name: /restock/i }),
      "ada@company.com",
    );
    await userEvent.click(canvas.getByRole("button"));
    await expect(await canvas.findByRole("status")).toHaveTextContent(/inbox/i);
  },
};

/** Klaviyo unreachable: the message says what to do, and the address is kept. */
export const NetworkFailure: Story = {
  beforeEach: () => {
    mocked(subscribe).mockResolvedValue({ ok: false, reason: "network" });
  },
  play: async ({ canvas, userEvent }) => {
    const field = canvas.getByRole("textbox", { name: /restock/i });
    await userEvent.type(field, "ada@company.com");
    await userEvent.click(canvas.getByRole("button"));
    await expect(await canvas.findByText(/couldn't reach/i)).toBeVisible();
    await expect(field).toHaveValue("ada@company.com");
  },
};
