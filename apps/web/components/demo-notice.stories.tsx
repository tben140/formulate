import type { Meta, StoryObj } from "@storybook/nextjs-vite";

import { DemoNotice } from "./demo-notice";

const meta = {
  title: "Layout/Demo notice",
  component: DemoNotice,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof DemoNotice>;

export default meta;

export const Default: StoryObj<typeof meta> = {};
