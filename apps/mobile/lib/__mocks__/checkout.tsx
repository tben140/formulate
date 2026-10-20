import type { ReactNode } from "react";
import { fn } from "storybook/test";

/**
 * lib/checkout for Storybook. The real module reads Expo Constants to decide
 * between Checkout Sheet Kit and the browser, and neither exists here.
 * `present` is a spy, so a story can check that Checkout was pressed. Stories
 * import `checkout` from here: calling the hook in a test breaks hook rules.
 */
export const checkout = {
  present: fn(),
  addEventListener: fn(() => undefined),
};

export const CheckoutProvider = ({ children }: { children: ReactNode }) => (
  <>{children}</>
);
export const useCheckout = () => checkout;
