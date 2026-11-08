import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server render and during hydration, true after: for markup
 * that differs once JavaScript runs (an Apply button it replaces), without a
 * hydration mismatch or an effect.
 */
export const useHydrated = () =>
  useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
