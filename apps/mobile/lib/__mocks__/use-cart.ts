import { fn } from "storybook/test";

/**
 * lib/use-cart for Storybook, hand-written for the same reason as
 * ./klaviyo.ts. Each hook returns the smallest shape the components read;
 * stories override them with mocked() where a state matters.
 */
const mutation = () => ({
  mutate: fn(),
  mutateAsync: fn(async () => null),
  isPending: false,
});

export const useCart = fn(() => ({ data: null, isLoading: false, error: null }));
export const useAddToCart = fn(mutation);
export const useUpdateCartLine = fn(mutation);
export const useClearCart = fn(mutation);
export const useIdentifyBuyer = fn(mutation);
